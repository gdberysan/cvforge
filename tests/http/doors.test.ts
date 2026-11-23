import { describe, expect, it } from 'vitest'
import { doorOf, isMacOnlyPath, isTailnetSameOrigin, tailnetConfig } from '@/lib/http/doors'

const TAILNET = { host: 'cvforge.tail1234.ts.net', login: 'owner@example.com' }
const h = (init: Record<string, string>) => new Headers(init)

describe('tailnetConfig', () => {
  it('exists only when both variables are set, normalised to lower case', () => {
    expect(tailnetConfig({})).toBeNull()
    expect(tailnetConfig({ CVFORGE_TAILNET_HOST: 'x.ts.net' })).toBeNull()
    expect(
      tailnetConfig({
        CVFORGE_TAILNET_HOST: ' CVForge.Tail1234.ts.net ',
        CVFORGE_TAILNET_LOGIN: 'owner@example.com',
      }),
    ).toEqual(TAILNET)
  })
})

describe('doorOf', () => {
  it('local: a loopback host with no proxy headers', () => {
    expect(doorOf(h({ host: 'localhost:3000' }), TAILNET)).toBe('local')
    expect(doorOf(h({ host: '127.0.0.1:3000' }), null)).toBe('local')
  })

  it("local: Next's own forwarded defaults (Host copied, socket address) are not a proxy", () => {
    expect(
      doorOf(
        h({
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-for': '::1',
        }),
        TAILNET,
      ),
    ).toBe('local')
    expect(
      doorOf(
        h({
          host: '127.0.0.1:3000',
          'x-forwarded-host': '127.0.0.1:3000',
          'x-forwarded-for': '::ffff:127.0.0.1',
        }),
        null,
      ),
    ).toBe('local')
  })

  it('tailnet: the configured host and the owner identity', () => {
    expect(
      doorOf(
        h({ host: 'cvforge.tail1234.ts.net', 'tailscale-user-login': 'owner@example.com' }),
        TAILNET,
      ),
    ).toBe('tailnet')
  })

  it('tailnet: Host rewritten to loopback, public host in X-Forwarded-Host', () => {
    expect(
      doorOf(
        h({
          host: '127.0.0.1:3000',
          'x-forwarded-host': 'cvforge.tail1234.ts.net',
          'x-forwarded-for': '100.64.0.7',
          'tailscale-user-login': 'owner@example.com',
        }),
        TAILNET,
      ),
    ).toBe('tailnet')
  })

  it('a proxied request is never the local door, whatever its Host says', () => {
    expect(
      doorOf(h({ host: '127.0.0.1:3000', 'x-forwarded-for': '100.64.0.9' }), TAILNET),
    ).toBeNull()
    expect(
      doorOf(h({ host: 'localhost:3000', 'x-forwarded-host': 'evil.example' }), TAILNET),
    ).toBeNull()
    expect(
      doorOf(h({ host: 'localhost:3000', 'tailscale-user-login': 'other@example.com' }), TAILNET),
    ).toBeNull()
  })

  it('refuses another identity, no identity, the wrong host, or no tailnet configured', () => {
    const host = 'cvforge.tail1234.ts.net'
    expect(doorOf(h({ host, 'tailscale-user-login': 'other@example.com' }), TAILNET)).toBeNull()
    expect(doorOf(h({ host }), TAILNET)).toBeNull()
    expect(
      doorOf(
        h({ host: 'other.tail1234.ts.net', 'tailscale-user-login': 'owner@example.com' }),
        TAILNET,
      ),
    ).toBeNull()
    expect(doorOf(h({ host, 'tailscale-user-login': 'owner@example.com' }), null)).toBeNull()
  })
})

describe('isTailnetSameOrigin', () => {
  it('requires the Origin to be the tailnet host over https', () => {
    expect(isTailnetSameOrigin(h({ origin: 'https://cvforge.tail1234.ts.net' }), TAILNET)).toBe(
      true,
    )
    expect(isTailnetSameOrigin(h({ origin: 'https://evil.example' }), TAILNET)).toBe(false)
    expect(isTailnetSameOrigin(h({ origin: 'http://cvforge.tail1234.ts.net' }), TAILNET)).toBe(
      false,
    )
    expect(isTailnetSameOrigin(h({}), TAILNET)).toBe(false)
    expect(
      isTailnetSameOrigin(
        h({ origin: 'https://cvforge.tail1234.ts.net', 'sec-fetch-site': 'cross-site' }),
        TAILNET,
      ),
    ).toBe(false)
  })
})

describe('isMacOnlyPath', () => {
  it('names restore and shutdown, nothing else', () => {
    expect(isMacOnlyPath('/api/import/backup')).toBe(true)
    expect(isMacOnlyPath('/api/shutdown')).toBe(true)
    expect(isMacOnlyPath('/api/export/backup')).toBe(false)
    expect(isMacOnlyPath('/settings')).toBe(false)
  })
})
