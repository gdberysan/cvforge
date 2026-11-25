import { describe, expect, it } from 'vitest'
import { doorOf } from '@/lib/http/doors'

const h = (init: Record<string, string>) => new Headers(init)

describe('doorOf: the Mac itself is the only way in', () => {
  it('local: a loopback host with no proxy headers', () => {
    expect(doorOf(h({ host: 'localhost:3000' }))).toBe('local')
    expect(doorOf(h({ host: '127.0.0.1:3000' }))).toBe('local')
  })

  it("local: Next's own forwarded defaults (Host copied, socket address) are not a proxy", () => {
    expect(
      doorOf(
        h({
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-for': '::1',
        }),
      ),
    ).toBe('local')
    expect(
      doorOf(
        h({
          host: '127.0.0.1:3000',
          'x-forwarded-host': '127.0.0.1:3000',
          'x-forwarded-for': '::ffff:127.0.0.1',
        }),
      ),
    ).toBe('local')
  })

  it('refuses any request that came through a proxy, whatever its Host says', () => {
    expect(doorOf(h({ host: '127.0.0.1:3000', 'x-forwarded-for': '100.64.0.9' }))).toBeNull()
    expect(doorOf(h({ host: 'localhost:3000', 'x-forwarded-host': 'evil.example' }))).toBeNull()
    // A Tailscale identity header no longer opens anything (the door is gone).
    expect(
      doorOf(h({ host: 'localhost:3000', 'tailscale-user-login': 'owner@example.com' })),
    ).toBeNull()
    expect(
      doorOf(
        h({
          host: 'cvforge.tail1234.ts.net',
          'tailscale-user-login': 'owner@example.com',
          'x-forwarded-for': '100.64.0.7',
        }),
      ),
    ).toBeNull()
  })

  it('refuses a host that is not loopback (a DNS-rebound page or a stranger)', () => {
    expect(doorOf(h({ host: 'evil.example:3000' }))).toBeNull()
  })
})
