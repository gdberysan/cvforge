import { describe, expect, it, vi } from 'vitest'

// If notify reached any of these, the satellite (no Next runtime) could not import it.
vi.mock('next/headers', () => {
  throw new Error('notify reached next/headers')
})
vi.mock('next/cache', () => {
  throw new Error('notify reached next/cache')
})
vi.mock('next/server', () => {
  throw new Error('notify reached next/server')
})

describe('lib/push/notify import boundary', () => {
  it('imports with no Next.js module in its graph', async () => {
    await expect(import('@/lib/push/notify')).resolves.toHaveProperty('notify')
  })
})
