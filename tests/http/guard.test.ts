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

describe('guardRequest — nothing remote gets in', () => {
  const remote = (method: string, path: string) =>
    new Request(`https://cvforge.tail1234.ts.net${path}`, {
      method,
      headers: {
        host: 'cvforge.tail1234.ts.net',
        origin: 'https://cvforge.tail1234.ts.net',
        'sec-fetch-site': 'same-origin',
        'tailscale-user-login': 'owner@example.com',
        'x-forwarded-for': '100.64.0.7',
      },
    })

  it('refuses a request from another device, even with an owner identity header', () => {
    expect(guardRequest(remote('GET', '/pipeline'), false)?.status).toBe(403)
    expect(guardRequest(remote('POST', '/api/ai/variant'), false)?.status).toBe(403)
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
      ),
    ).toBeNull()
  })
})
