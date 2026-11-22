import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@/lib/i18n'

// A route test has no request, so no locale cookie: answer in English.
vi.mock('@/lib/i18n/server', () => ({
  getLocale: async () => 'en',
  getTranslate: async () => ({ locale: 'en', t: makeTranslate('en') }),
}))

const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-push-routes-'))
process.env.CVFORGE_DB_PATH = path.join(dir, 'cvforge.db')
process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')

const subscriptions = await import('@/app/api/push/subscriptions/route')
const key = await import('@/app/api/push/key/route')

const post = (body: unknown) =>
  subscriptions.POST(
    new Request('http://localhost:3000/api/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
const sub = {
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p', auth: 'a' },
  },
  label: 'S25',
}

describe('push routes', () => {
  it('hands out the public key, generated once', async () => {
    const a = await (await key.GET()).json()
    const b = await (await key.GET()).json()
    expect(a.publicKey).toBe(b.publicKey)
  })

  it('stores a subscription, lists it, and removes it', async () => {
    expect((await post(sub)).status).toBe(200)
    expect((await (await subscriptions.GET()).json()).devices).toEqual([
      { endpoint: sub.subscription.endpoint, label: 'S25', lastOkAt: null },
    ])
    await subscriptions.DELETE(
      new Request(
        `http://localhost:3000/api/push/subscriptions?endpoint=${encodeURIComponent(sub.subscription.endpoint)}`,
        { method: 'DELETE' },
      ),
    )
    expect((await (await subscriptions.GET()).json()).devices).toEqual([])
  })

  it('accepts only the browsers’ own push services as endpoints', async () => {
    const at = (endpoint: string) =>
      post({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } })
    expect((await at('https://fcm.googleapis.com/fcm/send/x')).status).toBe(200)
    expect((await at('https://updates.push.services.mozilla.com/wpush/v2/x')).status).toBe(200)
    expect((await at('https://web.push.apple.com/x')).status).toBe(200)
    expect((await at('https://wns2-par02p.notify.windows.com/w/?token=x')).status).toBe(200)
    expect((await at('https://evil.example/collect')).status).toBe(400)
    expect((await at('https://fcm.googleapis.com.evil.example/x')).status).toBe(400)
    expect((await at('https://127.0.0.1/x')).status).toBe(400)
  })

  it('refuses anything that is not an https push subscription', async () => {
    expect(
      (await post({ subscription: { endpoint: 'http://x', keys: { p256dh: 'p', auth: 'a' } } }))
        .status,
    ).toBe(400)
    expect((await post({ nope: true })).status).toBe(400)
  })

  // Last on purpose: it damages the shared keys file.
  it('answers 500 naming the file when the keys are damaged, and leaves it alone', async () => {
    const file = path.join(dir, 'push.json')
    writeFileSync(file, 'not json')
    const res = await key.GET()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('push.json')
    expect(readFileSync(file, 'utf8')).toBe('not json')
  })
})
