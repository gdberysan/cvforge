import { describe, expect, it } from 'vitest'
import { guardRequest } from '@/lib/http/guard'

function req(method: string, headers: Record<string, string>, path = '/api/ai/variant') {
  return new Request(`http://localhost:3000${path}`, { method, headers })
}

describe('guardRequest', () => {
  it("lets the app's own POST through", () => {
    expect(
      guardRequest(req('POST', { host: 'localhost:3000', origin: 'http://localhost:3000' }), false),
    ).toBeNull()
  })

  it('refuses a cross-site POST to a paid route (a "simple" no-cors request)', () => {
    const blocked = guardRequest(
      req('POST', { host: 'localhost:3000', origin: 'https://evil.example' }),
      false,
    )
    expect(blocked?.status).toBe(403)
    expect(guardRequest(req('POST', { host: 'localhost:3000' }), false)?.status).toBe(403)
  })

  it('refuses a DNS-rebound page even on a GET, so the backup cannot be read', () => {
    expect(
      guardRequest(req('GET', { host: 'evil.example:3000' }, '/api/export/backup'), false)?.status,
    ).toBe(403)
  })

  it('lets plain loopback GETs through', () => {
    expect(guardRequest(req('GET', { host: '127.0.0.1:3000' }, '/cvs'), false)).toBeNull()
  })

  it('leaves the public read-only demo alone', () => {
    expect(guardRequest(req('POST', { host: 'cvforge.korven.dev' }), true)).toBeNull()
  })
})

describe('guardRequest — tailnet door', () => {
  const TAILNET = { host: 'cvforge.tail1234.ts.net', login: 'owner@example.com' }
  const remote = (method: string, path: string, extra: Record<string, string> = {}) =>
    new Request(`https://cvforge.tail1234.ts.net${path}`, {
      method,
      headers: {
        host: 'cvforge.tail1234.ts.net',
        'tailscale-user-login': 'owner@example.com',
        'x-forwarded-for': '100.64.0.7',
        ...extra,
      },
    })
  const sameSite = { origin: 'https://cvforge.tail1234.ts.net', 'sec-fetch-site': 'same-origin' }

  it('lets the owner read and write from the phone', () => {
    expect(guardRequest(remote('GET', '/pipeline'), false, TAILNET)).toBeNull()
    expect(guardRequest(remote('POST', '/api/ai/triage', sameSite), false, TAILNET)).toBeNull()
  })

  it('refuses a cross-site mutation through the tailnet door', () => {
    expect(
      guardRequest(
        remote('POST', '/api/ai/triage', { origin: 'https://evil.example' }),
        false,
        TAILNET,
      )?.status,
    ).toBe(403)
    expect(guardRequest(remote('POST', '/api/ai/triage'), false, TAILNET)?.status).toBe(403)
  })

  it('refuses a mutation from any other ts.net origin — next.config allows **.ts.net, the guard does not', () => {
    const otherTailnet = {
      origin: 'https://evil.other-tailnet.ts.net',
      'sec-fetch-site': 'cross-site',
    }
    expect(guardRequest(remote('POST', '/settings', otherTailnet), false, TAILNET)?.status).toBe(
      403,
    )
    expect(
      guardRequest(
        req('POST', { host: 'localhost:3000', ...otherTailnet }, '/settings'),
        false,
        TAILNET,
      )?.status,
    ).toBe(403)
  })

  it('refuses Mac-only routes from the phone with a mac-only code', async () => {
    const res = guardRequest(remote('POST', '/api/import/backup', sameSite), false, TAILNET)
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ code: 'mac-only' })
    expect(guardRequest(remote('POST', '/api/shutdown', sameSite), false, TAILNET)?.status).toBe(
      403,
    )
  })

  it('refuses another identity on a plain GET', () => {
    expect(
      guardRequest(
        remote('GET', '/pipeline', { 'tailscale-user-login': 'other@example.com' }),
        false,
        TAILNET,
      )?.status,
    ).toBe(403)
  })

  it('without a tailnet configured, behaves exactly as before', () => {
    expect(guardRequest(remote('GET', '/pipeline'), false, null)?.status).toBe(403)
    expect(guardRequest(req('GET', { host: '127.0.0.1:3000' }, '/cvs'), false, null)).toBeNull()
  })

  it('still lets the Mac restore and quit', () => {
    expect(
      guardRequest(
        req(
          'POST',
          { host: 'localhost:3000', origin: 'http://localhost:3000' },
          '/api/import/backup',
        ),
        false,
        TAILNET,
      ),
    ).toBeNull()
  })
})
