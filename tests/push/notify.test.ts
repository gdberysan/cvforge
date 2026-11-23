import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.fn()
vi.mock('web-push', () => ({ default: { sendNotification } }))
vi.mock('@/lib/push/keys', () => ({ vapidKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }) }))
vi.mock('@/lib/settings', () => ({ readSettings: () => ({}) }))

const { openDb, runMigrations } = await import('@/lib/db/client')
const { notify, flushOutbox } = await import('@/lib/push/notify')
const { listSubscriptions, saveSubscription } = await import('@/lib/push/store')

const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-notify-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let n = 0
function freshDb(withDevice = true) {
  const { db } = openDb(path.join(dir, `t${n++}.db`))
  runMigrations(db)
  if (withDevice)
    saveSubscription(db, {
      endpoint: 'https://fcm.example/a',
      p256dh: 'k',
      auth: 'a',
      label: 'S25',
    })
  return db
}
const day = (h: number) => new Date(2026, 9, 15, h, 0)
const msg = {
  kind: 'verdict-ready' as const,
  title: 'Worth it',
  body: 'Growth Lead · Acme',
  url: '/application/a1',
}

describe('notify', () => {
  // Braces matter: a function returned from beforeEach is run as a teardown,
  // and mockReset() returns the mock itself.
  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 })
  })

  it('sends only the title, body, url and tag', async () => {
    const db = freshDb()
    expect(await notify(db, msg, day(12))).toBe('sent')
    const [, payload] = sendNotification.mock.calls[0]
    expect(JSON.parse(payload)).toEqual({
      title: 'Worth it',
      body: 'Growth Lead · Acme',
      url: '/application/a1',
      tag: 'verdict-ready:/application/a1',
    })
  })

  it('two finds are two notifications on the phone, not one replacing the other', async () => {
    const db = freshDb()
    const find = (id: string) => ({
      kind: 'agent-find' as const,
      title: `Nueva vacante: ${id}`,
      body: 'Acme',
      url: `/?find=${id}`,
    })
    await notify(db, find('1'), day(12))
    await notify(db, find('2'), day(12))
    const tags = sendNotification.mock.calls.map((c) => JSON.parse(c[1]).tag)
    expect(new Set(tags).size).toBe(2)
  })

  it('a test push keeps its own tag, which the phone shows even in front', async () => {
    const db = freshDb()
    await notify(db, { kind: 'test', title: 'T', body: 'B', url: '/settings' }, day(12))
    expect(JSON.parse(sendNotification.mock.calls[0][1]).tag).toBe('test')
  })

  it('quiet hours hold every find, not just the newest', async () => {
    const db = freshDb()
    const find = (id: string) => ({
      kind: 'agent-find' as const,
      title: id,
      body: 'Acme',
      url: `/?find=${id}`,
    })
    await notify(db, find('1'), day(23))
    await notify(db, find('2'), day(23))
    expect(await flushOutbox(db, new Date(2026, 9, 16, 9, 0))).toBe(2)
  })

  it('defers during quiet hours and the flush delivers it after they end', async () => {
    const db = freshDb()
    expect(await notify(db, msg, day(23))).toBe('deferred')
    expect(sendNotification).not.toHaveBeenCalled()
    expect(await flushOutbox(db, day(23))).toBe(0)
    expect(await flushOutbox(db, new Date(2026, 9, 16, 8, 1))).toBe(1)
    expect(sendNotification).toHaveBeenCalledOnce()
    expect(await flushOutbox(db, new Date(2026, 9, 16, 8, 2))).toBe(0)
  })

  it('keeps only the newest pending notification of a kind', async () => {
    const db = freshDb()
    await notify(db, msg, day(23))
    await notify(db, { ...msg, title: 'Strong' }, day(23))
    expect(await flushOutbox(db, new Date(2026, 9, 16, 9, 0))).toBe(1)
    expect(JSON.parse(sendNotification.mock.calls[0][1]).title).toBe('Strong')
  })

  it('deletes a subscription the push service reports gone, without retrying', async () => {
    const db = freshDb()
    sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('gone'), { statusCode: 410 })),
    )
    await notify(db, msg, day(12))
    expect(sendNotification).toHaveBeenCalledOnce()
    expect(listSubscriptions(db)).toEqual([])
  })

  it('retries a transient failure once, then reports failed and never throws', async () => {
    const db = freshDb()
    sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('flaky'), { statusCode: 503 })),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(notify(db, msg, day(12))).resolves.toBe('failed')
    expect(sendNotification).toHaveBeenCalledTimes(2)
    expect(listSubscriptions(db)).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('a subscription the push service reports gone is not a delivery', async () => {
    const db = freshDb()
    sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('gone'), { statusCode: 410 })),
    )
    expect(await notify(db, { ...msg, kind: 'test' }, day(12))).toBe('failed')
  })

  it('reports no devices when nothing is subscribed', async () => {
    expect(await notify(freshDb(false), msg, day(12))).toBe('no-devices')
  })

  it('a test push ignores quiet hours — the person is looking at the screen', async () => {
    const db = freshDb()
    expect(await notify(db, { ...msg, kind: 'test' }, day(23))).toBe('sent')
  })

  it('keeps a pending notification whose delivery failed, and sends it next minute', async () => {
    const db = freshDb()
    await notify(db, msg, day(23))
    sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('down'), { statusCode: 503 })),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await flushOutbox(db, new Date(2026, 9, 16, 8, 1))).toBe(0)
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 })
    expect(await flushOutbox(db, new Date(2026, 9, 16, 8, 2))).toBe(1)
    expect(await flushOutbox(db, new Date(2026, 9, 16, 8, 3))).toBe(0)
    warn.mockRestore()
  })

  it('drops a pending notification twelve hours past its time', async () => {
    const db = freshDb()
    await notify(db, msg, day(23))
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 })
    // Quiet hours end 08:00; 20:30 is more than twelve hours later.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await flushOutbox(db, new Date(2026, 9, 16, 20, 30))).toBe(0)
    expect(sendNotification).not.toHaveBeenCalled()
    // Never silently: the log says a notification was lost, and which kind.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('verdict-ready'))
    warn.mockRestore()
    expect(await flushOutbox(db, new Date(2026, 9, 16, 20, 31))).toBe(0)
  })

  it('never runs two flushes at once', async () => {
    const db = freshDb()
    await notify(db, msg, day(23))
    let release: () => void = () => {}
    sendNotification.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ statusCode: 201 })
        }),
    )
    const at = new Date(2026, 9, 16, 8, 1)
    const first = flushOutbox(db, at)
    expect(await flushOutbox(db, at)).toBe(0)
    release()
    expect(await first).toBe(1)
    expect(sendNotification).toHaveBeenCalledOnce()
  })

  it('the one-flush rule holds across module registries', async () => {
    // Next gives route handlers, pages and instrumentation.ts each their own
    // copy of this module; a module-level flag would guard only its own copy.
    const db = freshDb()
    await notify(db, msg, day(23))
    let release: () => void = () => {}
    sendNotification.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ statusCode: 201 })
        }),
    )
    vi.resetModules()
    const other = await import('@/lib/push/notify')
    expect(other.flushOutbox).not.toBe(flushOutbox)
    const at = new Date(2026, 9, 16, 8, 1)
    const first = flushOutbox(db, at)
    expect(await other.flushOutbox(db, at)).toBe(0)
    release()
    expect(await first).toBe(1)
    expect(sendNotification).toHaveBeenCalledOnce()
  })
})
