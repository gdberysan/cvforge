'use client'

/**
 * Google Drive as the person's own sync, with nothing on our side.
 *
 * One file, `rumbo.db`, in the Drive's app data folder: a hidden folder only
 * this app can see (scope `drive.appdata`, which Google classifies as
 * non-sensitive). Rumbo cannot read anything else in the Drive, and the
 * person cannot delete the file by accident.
 *
 * Sign-in is Google's browser flow for client-side apps (implicit grant):
 * the tab goes to Google and comes back to /drive/ on this origin with a
 * short-lived access token (about an hour), kept in this tab's
 * sessionStorage only. No Google script runs in this page (it sits beside
 * the Anthropic key), no refresh token exists, and nothing is stored by us.
 * A new session needs a tap; with consent already given, Google sends the
 * person straight back.
 *
 * On with Rumbo's own client id; a build can override or empty it (NEXT_PUBLIC_GOOGLE_CLIENT_ID).
 */
import { BASE } from './base'

/**
 * Rumbo's OAuth client (Google Cloud project rumbo-515807, web client "Rumbo
 * web", origin https://rumbo.korven.dev, return https://rumbo.korven.dev/app/drive/,
 * scope drive.appdata only, in production since 2026-11-25). A client id is
 * public by design (it is in every page that signs in); there is no secret.
 * A build can override it, or turn Drive off with an empty value.
 */
const RUMBO_CLIENT_ID = '452164715050-akctfgfusjq0vmgipjg622a3t817lps0.apps.googleusercontent.com'
export const GOOGLE_CLIENT_ID: string = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? RUMBO_CLIENT_ID
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
export const FILE_NAME = 'rumbo.db'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export function driveAvailable(): boolean {
  return GOOGLE_CLIENT_ID !== ''
}

export type Token = { value: string; expiresAt: number }
let token: Token | null = null

export function currentToken(now = Date.now()): string | null {
  // A minute's margin: a token about to expire is treated as gone.
  return token && token.expiresAt - 60_000 > now ? token.value : null
}

export function forgetToken(): void {
  token = null
  try {
    sessionStorage.removeItem(TOKEN)
  } catch {}
}

/** Keeps a token Google returned (seconds until it expires). */
export function acceptToken(value: string, expiresIn: number, now = Date.now()): void {
  token = { value, expiresAt: now + expiresIn * 1000 }
}

/** Where Google sends the person back: a page of ours that only relays the token. */
export function redirectUri(origin = window.location.origin): string {
  return `${origin}${BASE}/drive/`
}

export function authUrl(opts: { state: string; silent: boolean; origin?: string }): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(opts.origin),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: opts.state,
  })
  // Already consented: no screen, just a fresh token.
  if (opts.silent) params.set('prompt', 'none')
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

const PENDING = 'drive.pending'
const TOKEN = 'drive.token'
const ERROR = 'drive.error'

/**
 * Sends this tab to Google and back (no pop-up: the site's isolation header,
 * Cross-Origin-Opener-Policy, cuts any tie to a window on another site, and
 * pop-ups are unreliable on phones). Where to return and the state check
 * wait in sessionStorage for /drive/ to read.
 */
export function authorize(silent: boolean): void {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(
      PENDING,
      JSON.stringify({ state, returnTo: window.location.pathname + window.location.search }),
    )
  } catch {}
  window.location.assign(authUrl({ state, silent }))
}

export type ReturnResult =
  | { kind: 'token'; returnTo: string }
  | { kind: 'error'; reason: 'denied' | 'mismatch'; returnTo: string }

/** On /drive/: checks Google's answer against the pending request and keeps the token for this tab. */
export function receiveReturn(hash: string): ReturnResult {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  let pending: { state?: string; returnTo?: string } = {}
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? '{}')
    sessionStorage.removeItem(PENDING)
  } catch {}
  const returnTo =
    pending.returnTo && pending.returnTo.startsWith('/') ? pending.returnTo : `${BASE}/settings/`
  const accessToken = p.get('access_token')
  if (!pending.state || p.get('state') !== pending.state) {
    sessionStorage.setItem(ERROR, 'denied')
    return { kind: 'error', reason: 'mismatch', returnTo }
  }
  if (!accessToken) {
    try {
      sessionStorage.setItem(ERROR, 'denied')
    } catch {}
    return { kind: 'error', reason: 'denied', returnTo }
  }
  try {
    sessionStorage.setItem(
      TOKEN,
      JSON.stringify({
        value: accessToken,
        expiresAt: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000,
      }),
    )
  } catch {}
  return { kind: 'token', returnTo }
}

/** In the app: picks up a token (or a refusal) the return page left for this tab. */
export function resumeFromReturn(now = Date.now()): { fresh: boolean; error: 'denied' | null } {
  let fresh = false
  let error: 'denied' | null = null
  try {
    const raw = sessionStorage.getItem(TOKEN)
    if (raw) {
      const t = JSON.parse(raw) as Token
      if (t.expiresAt > now) {
        fresh = token?.value !== t.value
        token = t
      } else sessionStorage.removeItem(TOKEN)
    }
    if (sessionStorage.getItem(ERROR)) {
      error = 'denied'
      sessionStorage.removeItem(ERROR)
    }
  } catch {}
  return { fresh, error }
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call(path: string, init: RequestInit & { base?: string } = {}): Promise<Response> {
  const t = currentToken()
  if (!t) throw new DriveError(401, 'no token')
  const res = await fetch(`${init.base ?? API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  })
  if (res.status === 401) forgetToken()
  if (!res.ok) throw new DriveError(res.status, `Drive ${res.status}`)
  return res
}

export type RemoteFile = { id: string; modifiedTime: string; size: number }

/** The backup in the app data folder, if there is one. */
export async function findBackup(): Promise<RemoteFile | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const res = await call(`/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime,size)`)
  const { files } = (await res.json()) as {
    files: { id: string; modifiedTime: string; size?: string }[]
  }
  const f = [...files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0]
  return f ? { id: f.id, modifiedTime: f.modifiedTime, size: Number(f.size ?? 0) } : null
}

export async function download(id: string): Promise<Uint8Array> {
  const res = await call(`/files/${id}?alt=media`)
  return new Uint8Array(await res.arrayBuffer())
}

/** The key never goes to Drive: a database holding something key-shaped is refused. */
export function looksLikeKeyInside(bytes: Uint8Array): boolean {
  const needle = [0x73, 0x6b, 0x2d, 0x61, 0x6e, 0x74, 0x2d] // "sk-ant-"
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

/** Writes the database to Drive: a new file the first time, the same file after. */
export async function upload(bytes: Uint8Array, id: string | null): Promise<RemoteFile> {
  if (looksLikeKeyInside(bytes)) throw new DriveError(0, 'refused: key-shaped text in the database')
  const body = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' })
  let res: Response
  if (id) {
    res = await call(`/files/${id}?uploadType=media&fields=id,modifiedTime,size`, {
      base: UPLOAD,
      method: 'PATCH',
      body,
    })
  } else {
    const boundary = `rumbo-${crypto.randomUUID()}`
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      body,
      `\r\n--${boundary}--`,
    ])
    res = await call('/files?uploadType=multipart&fields=id,modifiedTime,size', {
      base: UPLOAD,
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    })
  }
  const f = (await res.json()) as { id: string; modifiedTime: string; size?: string }
  return { id: f.id, modifiedTime: f.modifiedTime, size: Number(f.size ?? bytes.length) }
}

/** Disconnect: the token is revoked at Google; the file stays in the person's Drive. */
export async function revoke(): Promise<void> {
  const t = token?.value
  forgetToken()
  if (!t) return
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, {
    method: 'POST',
  }).catch(() => {})
}
