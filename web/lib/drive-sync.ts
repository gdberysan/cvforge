'use client'

/**
 * Keeps this browser's data and the person's Drive copy in step (see drive.ts
 * for the why, drive-plan.ts for the decision). Per-browser facts live in
 * localStorage: connected or not, the Drive file's id, the Drive version this
 * browser last saw, and whether anything changed here since. Changes are
 * pushed a few seconds after they happen while a token is valid; without one
 * (a new session), the person taps once to sync.
 */
import { dataChanged, onDataChanged, workerApi } from './actions-client'
import {
  authorize,
  currentToken,
  DriveError,
  download,
  driveAvailable,
  findBackup,
  resumeFromReturn,
  revoke,
  upload,
} from './drive'
import { planSync } from './drive-plan'

type Saved = {
  connected: boolean
  fileId: string | null
  lastSeenRemote: string | null
  changedSince: boolean
  lastSyncAt: number | null
}
const KEY = 'drive.sync'
const EMPTY: Saved = {
  connected: false,
  fileId: null,
  lastSeenRemote: null,
  changedSince: true,
  lastSyncAt: null,
}

function load(): Saved {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...EMPTY }
  }
}
function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {}
}

export type DriveStatus =
  | { kind: 'off' }
  | { kind: 'needs-tap' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'ask'; driveAt: string }
  | { kind: 'error'; reason: 'denied' | 'busy' | 'network' }

let saved: Saved = typeof window === 'undefined' ? { ...EMPTY } : load()
let status: DriveStatus = !saved.connected ? { kind: 'off' } : { kind: 'needs-tap' }
const listeners = new Set<(s: DriveStatus, saved: Saved) => void>()
let pulling = false
let timer: ReturnType<typeof setTimeout> | null = null

function set(next: DriveStatus): void {
  status = next
  for (const fn of listeners) fn(status, saved)
}
function update(patch: Partial<Saved>): void {
  saved = { ...saved, ...patch }
  save(saved)
}

export function driveState(): {
  status: DriveStatus
  connected: boolean
  lastSyncAt: number | null
  changedSince: boolean
} {
  return {
    status,
    connected: saved.connected,
    lastSyncAt: saved.lastSyncAt,
    changedSince: saved.changedSince,
  }
}

export function onDrive(fn: () => void): () => void {
  const wrapped = () => fn()
  listeners.add(wrapped)
  return () => listeners.delete(wrapped)
}

/** Brings Drive's copy here (replaces this browser's data). */
async function pull(fileId: string, remoteModified: string): Promise<boolean> {
  const bytes = await download(fileId)
  pulling = true
  try {
    const result = await (await workerApi()).importDatabase(bytes)
    if (!result.ok) {
      set({ kind: 'error', reason: result.problem === 'busy' ? 'busy' : 'network' })
      return false
    }
    update({ fileId, lastSeenRemote: remoteModified, changedSince: false, lastSyncAt: Date.now() })
    dataChanged()
    return true
  } finally {
    pulling = false
  }
}

async function push(fileId: string | null): Promise<void> {
  const bytes = await (await workerApi()).exportDatabase()
  const f = await upload(bytes as Uint8Array, fileId)
  update({
    fileId: f.id,
    lastSeenRemote: f.modifiedTime,
    changedSince: false,
    lastSyncAt: Date.now(),
  })
}

/** One sync with a valid token: decide, then push, pull, or ask. */
export async function syncNow(): Promise<void> {
  if (!currentToken()) {
    set({ kind: 'needs-tap' })
    return
  }
  set({ kind: 'syncing' })
  try {
    const remote = await findBackup()
    const { hasProfile } = await (await workerApi()).status()
    const plan = planSync({
      remoteModified: remote?.modifiedTime ?? null,
      lastSeenRemote: saved.lastSeenRemote,
      localChanged: saved.changedSince,
      localEmpty: !hasProfile,
    })
    if (plan === 'push') await push(remote?.id ?? saved.fileId)
    if (plan === 'pull' && remote) {
      if (!(await pull(remote.id, remote.modifiedTime))) return
    }
    if (plan === 'ask' && remote) {
      set({ kind: 'ask', driveAt: remote.modifiedTime })
      return
    }
    if (plan === 'nothing' && remote) update({ fileId: remote.id })
    set({ kind: 'synced', at: saved.lastSyncAt ?? Date.now() })
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) set({ kind: 'needs-tap' })
    else set({ kind: 'error', reason: 'network' })
  }
}

/** Both sides changed: the person chooses which version wins. */
export async function resolveConflict(keep: 'here' | 'drive'): Promise<void> {
  set({ kind: 'syncing' })
  try {
    const remote = await findBackup()
    if (keep === 'here' || !remote) await push(remote?.id ?? saved.fileId)
    else if (!(await pull(remote.id, remote.modifiedTime))) return
    set({ kind: 'synced', at: saved.lastSyncAt ?? Date.now() })
  } catch {
    set({ kind: 'error', reason: 'network' })
  }
}

/** First connection, or a new session: to Google and back (the sync runs on return). */
export async function connectAndSync(): Promise<void> {
  if (currentToken()) {
    await syncNow()
    return
  }
  try {
    localStorage.setItem(CONNECTING, '1')
  } catch {}
  authorize(saved.connected)
}
const CONNECTING = 'drive.connecting'

export async function disconnect(): Promise<void> {
  await revoke()
  saved = { ...EMPTY }
  save(saved)
  set({ kind: 'off' })
}

// Back from Google: keep the token, mark the connection, sync once.
if (typeof window !== 'undefined' && driveAvailable()) {
  const back = resumeFromReturn()
  let connecting = false
  try {
    connecting = localStorage.getItem(CONNECTING) === '1'
    localStorage.removeItem(CONNECTING)
  } catch {}
  if (back.error && connecting) status = { kind: 'error', reason: 'denied' }
  else if (currentToken() && (connecting || back.fresh)) {
    update({ connected: true })
    status = { kind: 'syncing' }
    setTimeout(() => void syncNow(), 0)
  } else if (saved.connected && currentToken()) {
    status = { kind: 'synced', at: saved.lastSyncAt ?? Date.now() }
  }
}

// Every change here is a change to send; a pull's own reload is not.
if (typeof window !== 'undefined' && driveAvailable()) {
  onDataChanged(() => {
    if (pulling || !saved.connected) return
    update({ changedSince: true })
    if (!currentToken()) {
      if (status.kind !== 'ask') set({ kind: 'needs-tap' })
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 8000)
  })
}
