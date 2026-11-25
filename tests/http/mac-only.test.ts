import { describe, expect, it, vi } from 'vitest'

let current = new Headers()
vi.mock('next/headers', () => ({ headers: async () => current }))

const { macOnlyRefusal } = await import('@/lib/http/mac-only')

describe('macOnlyRefusal', () => {
  it('lets the Mac through', async () => {
    current = new Headers({ host: 'localhost:3000' })
    expect(await macOnlyRefusal()).toBeNull()
  })

  it('refuses another device, even with an owner identity header', async () => {
    current = new Headers({
      host: 'cvforge.tail1234.ts.net',
      'tailscale-user-login': 'owner@example.com',
    })
    expect(await macOnlyRefusal()).toMatchObject({ ok: false, code: 'mac-only' })
  })
})
