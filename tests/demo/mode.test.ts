import { afterEach, describe, expect, it } from 'vitest'
import { assertWritable, DemoReadOnlyError, demoBlock, isDemo } from '@/lib/demo/mode'

const saved = process.env.CVFORGE_MODE
afterEach(() => {
  if (saved === undefined) delete process.env.CVFORGE_MODE
  else process.env.CVFORGE_MODE = saved
})

describe('demo mode', () => {
  it('is off unless CVFORGE_MODE is exactly "demo"', () => {
    delete process.env.CVFORGE_MODE
    expect(isDemo()).toBe(false)
    process.env.CVFORGE_MODE = 'Demo'
    expect(isDemo()).toBe(false)
    process.env.CVFORGE_MODE = 'demo'
    expect(isDemo()).toBe(true)
  })

  it('assertWritable is a no-op outside demo and throws a coded error inside', () => {
    delete process.env.CVFORGE_MODE
    expect(() => assertWritable()).not.toThrow()
    process.env.CVFORGE_MODE = 'demo'
    expect(() => assertWritable()).toThrow(DemoReadOnlyError)
    try {
      assertWritable()
    } catch (e) {
      expect((e as DemoReadOnlyError).code).toBe('demo-read-only')
    }
  })

  it('demoBlock is the Result every blocked action returns', () => {
    expect(demoBlock()).toEqual({
      ok: false,
      error: 'This is the demo — nothing is saved. The full version runs on your machine.',
      code: 'demo-read-only',
    })
  })
})
