import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({ restoreDatabase: vi.fn() }))
vi.mock('@/lib/db/backup', () => ({ validateBackup: () => ({ ok: true }) }))
vi.mock('@/lib/ai/in-flight', () => ({ paidRunInFlight: () => false }))

const shutdown = await import('@/app/api/shutdown/route')
const restore = await import('@/app/api/import/backup/route')

const phone = (path: string, body?: string) =>
  new Request(`https://cvforge.tail1234.ts.net${path}`, {
    method: 'POST',
    body,
    headers: {
      host: 'cvforge.tail1234.ts.net',
      origin: 'https://cvforge.tail1234.ts.net',
      'sec-fetch-site': 'same-origin',
      'tailscale-user-login': 'owner@example.com',
      'x-forwarded-for': '100.64.0.7',
    },
  })

describe('Mac-only routes refuse another device themselves, not only in the guard', () => {
  it('shutdown and restore answer 403 mac-only to a proxied request', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const s = await shutdown.POST(phone('/api/shutdown'))
    expect(s.status).toBe(403)
    const r = await restore.POST(
      phone('/api/import/backup', JSON.stringify({ backup: 'x'.repeat(200) })),
    )
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ code: 'mac-only' })
    exit.mockRestore()
  })
})
