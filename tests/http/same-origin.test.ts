import { describe, expect, it } from 'vitest'
import { isSameOriginRequest } from '@/lib/http/same-origin'

function req(headers: Record<string, string>) {
  return new Request('http://localhost:3000/api/shutdown', { method: 'POST', headers })
}

describe('isSameOriginRequest', () => {
  it('accepts the app talking to itself on localhost', () => {
    expect(
      isSameOriginRequest(req({ origin: 'http://localhost:3000', host: 'localhost:3000' })),
    ).toBe(true)
    expect(
      isSameOriginRequest(req({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })),
    ).toBe(true)
    expect(isSameOriginRequest(req({ origin: 'http://[::1]:3000', host: '[::1]:3000' }))).toBe(true)
  })

  it('rejects a cross-origin page', () => {
    expect(
      isSameOriginRequest(req({ origin: 'http://evil.example', host: 'localhost:3000' })),
    ).toBe(false)
    expect(isSameOriginRequest(req({ host: 'localhost:3000' }))).toBe(false)
  })

  it('rejects a DNS-rebound page whose Origin and Host agree but are not loopback', () => {
    expect(
      isSameOriginRequest(req({ origin: 'http://evil.example:3000', host: 'evil.example:3000' })),
    ).toBe(false)
  })

  it("trusts the browser's Sec-Fetch-Site when present, so a LAN address still works", () => {
    expect(
      isSameOriginRequest(
        req({
          origin: 'http://192.168.1.5:3000',
          host: '192.168.1.5:3000',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(true)
    expect(
      isSameOriginRequest(
        req({
          origin: 'http://evil.example:3000',
          host: 'evil.example:3000',
          'sec-fetch-site': 'cross-site',
        }),
      ),
    ).toBe(false)
  })
})
