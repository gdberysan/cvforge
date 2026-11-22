import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDiscoverEnabled } from '@/lib/discover/mode'

describe('isDiscoverEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off by default', () => {
    vi.stubEnv('CVFORGE_DISCOVER', '')
    expect(isDiscoverEnabled()).toBe(false)
  })

  it('turns on with CVFORGE_DISCOVER=1', () => {
    vi.stubEnv('CVFORGE_DISCOVER', '1')
    expect(isDiscoverEnabled()).toBe(true)
  })

  it('stays off for any other value', () => {
    vi.stubEnv('CVFORGE_DISCOVER', 'true')
    expect(isDiscoverEnabled()).toBe(false)
  })

  it('demo mode wins over the flag', () => {
    vi.stubEnv('CVFORGE_DISCOVER', '1')
    vi.stubEnv('CVFORGE_MODE', 'demo')
    expect(isDiscoverEnabled()).toBe(false)
  })
})
