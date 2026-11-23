import { afterEach, describe, expect, it, vi } from 'vitest'

const flushOutbox = vi.fn(() => Promise.resolve(0))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/push/notify', () => ({ flushOutbox }))
const startKitRunner = vi.fn()
vi.mock('@/lib/kit/runner', () => ({ startKitRunner }))

const { register } = await import('@/instrumentation')
const g = globalThis as unknown as { __cvforgePushFlush?: ReturnType<typeof setInterval> }

describe('instrumentation flush loop', () => {
  afterEach(() => {
    if (g.__cvforgePushFlush) clearInterval(g.__cvforgePushFlush)
    g.__cvforgePushFlush = undefined
    delete process.env.NEXT_RUNTIME
    delete process.env.CVFORGE_MODE
    vi.useRealTimers()
    startKitRunner.mockClear()
  })

  it('starts the kit runner with the database, every time it registers', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    await register()
    await register()
    // The runner keeps itself to one per process (lib/kit/runner.ts).
    expect(startKitRunner).toHaveBeenCalledTimes(2)
    expect(startKitRunner.mock.calls[0]?.[0]).toEqual({})
  })

  it('starts one loop per process that flushes every minute', async () => {
    vi.useFakeTimers()
    process.env.NEXT_RUNTIME = 'nodejs'
    await register()
    const first = g.__cvforgePushFlush
    await register()
    expect(g.__cvforgePushFlush).toBe(first)
    vi.advanceTimersByTime(60_000)
    expect(flushOutbox).toHaveBeenCalledOnce()
  })

  it('never runs in the demo', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.CVFORGE_MODE = 'demo'
    await register()
    expect(g.__cvforgePushFlush).toBeUndefined()
    expect(startKitRunner).not.toHaveBeenCalled()
  })
})
