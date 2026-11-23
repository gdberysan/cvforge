import { afterEach, describe, expect, it, vi } from 'vitest'

let current = new Headers()
vi.mock('next/headers', () => ({ headers: async () => current }))

const { macOnlyRefusal } = await import('@/lib/http/mac-only')

describe('macOnlyRefusal', () => {
  afterEach(() => {
    delete process.env.CVFORGE_TAILNET_HOST
    delete process.env.CVFORGE_TAILNET_LOGIN
  })

  it('lets the Mac through', async () => {
    current = new Headers({ host: 'localhost:3000' })
    expect(await macOnlyRefusal()).toBeNull()
  })

  it('refuses the phone, even signed in as the owner', async () => {
    process.env.CVFORGE_TAILNET_HOST = 'cvforge.tail1234.ts.net'
    process.env.CVFORGE_TAILNET_LOGIN = 'owner@example.com'
    current = new Headers({
      host: 'cvforge.tail1234.ts.net',
      'tailscale-user-login': 'owner@example.com',
    })
    expect(await macOnlyRefusal()).toMatchObject({ ok: false, code: 'mac-only' })
  })
})
