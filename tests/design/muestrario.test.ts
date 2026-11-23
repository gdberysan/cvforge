// tests/design/muestrario.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

afterEach(() => vi.unstubAllEnvs())

describe('/muestrario', () => {
  it('does not exist in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { default: Page } = await import('@/app/(app)/muestrario/page')
    await expect(async () => Page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
