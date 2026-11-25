// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planSync } from '@/web/lib/drive-plan'
import { must } from '../support/must'

describe('planSync: never one side over the other on a guess', () => {
  const base = { remoteModified: null, lastSeenRemote: null, localChanged: true, localEmpty: false }
  it('first copy: nothing on Drive and data here -> push; nothing anywhere -> nothing', () => {
    expect(planSync(base)).toBe('push')
    expect(planSync({ ...base, localEmpty: true })).toBe('nothing')
  })
  it('Drive unchanged since our last sync: push our changes, or nothing', () => {
    const seen = { ...base, remoteModified: 't1', lastSeenRemote: 't1' }
    expect(planSync(seen)).toBe('push')
    expect(planSync({ ...seen, localChanged: false })).toBe('nothing')
  })
  it('Drive changed elsewhere: pull if nothing here would be lost', () => {
    const elsewhere = { ...base, remoteModified: 't2', lastSeenRemote: 't1' }
    expect(planSync({ ...elsewhere, localChanged: false })).toBe('pull')
    // A new device with no data of its own takes Drive's copy.
    expect(planSync({ ...elsewhere, lastSeenRemote: null, localEmpty: true })).toBe('pull')
  })
  it('both changed: ask the person', () => {
    expect(planSync({ ...base, remoteModified: 't2', lastSeenRemote: 't1' })).toBe('ask')
    // A device with data that never synced, meeting a Drive copy: ask too.
    expect(planSync({ ...base, remoteModified: 't2' })).toBe('ask')
  })
})

describe('the Drive client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks Google for the app folder only, and returns to our own page', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client-123')
    vi.resetModules()
    const { authUrl, DRIVE_SCOPE } = await import('@/web/lib/drive')
    const url = new URL(authUrl({ state: 's1', silent: false, origin: 'https://rumbo.example' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE)
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata')
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('redirect_uri')).toMatch(/^https:\/\/rumbo\.example.*\/drive\/$/)
    expect(url.searchParams.get('prompt')).toBeNull()
    const silent = new URL(authUrl({ state: 's1', silent: true, origin: 'https://rumbo.example' }))
    expect(silent.searchParams.get('prompt')).toBe('none')
    vi.unstubAllEnvs()
  })

  it('refuses to upload anything that holds a key-shaped string', async () => {
    const { looksLikeKeyInside, upload, acceptToken } = await import('@/web/lib/drive')
    const enc = new TextEncoder()
    expect(looksLikeKeyInside(enc.encode('xx sk-ant-api03-abc xx'))).toBe(true)
    expect(looksLikeKeyInside(enc.encode('a normal database'))).toBe(false)
    acceptToken('tok', 3600)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(upload(enc.encode('sk-ant-api03-zzz'), null)).rejects.toThrow(/refused/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates the file in the app folder the first time, then updates the same file', async () => {
    const { upload, acceptToken } = await import('@/web/lib/drive')
    acceptToken('tok', 3600)
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ id: 'f1', modifiedTime: 't1', size: '4' }), {
          status: 200,
        })
      }),
    )
    const first = await upload(new Uint8Array([1, 2, 3, 4]), null)
    expect(first).toEqual({ id: 'f1', modifiedTime: 't1', size: 4 })
    expect(calls[0]?.url).toMatch(/upload\/drive\/v3\/files\?uploadType=multipart/)
    expect(calls[0]?.init.method).toBe('POST')
    const sent = await (must(calls[0]).init.body as Blob).text()
    expect(sent).toContain('"parents":["appDataFolder"]')
    expect((must(calls[0]).init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    await upload(new Uint8Array([5]), 'f1')
    expect(calls[1]?.url).toMatch(/upload\/drive\/v3\/files\/f1\?uploadType=media/)
    expect(calls[1]?.init.method).toBe('PATCH')
  })
})
