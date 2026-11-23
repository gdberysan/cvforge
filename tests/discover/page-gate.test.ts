import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDiscoverEnabled } from '@/lib/discover/mode'

// The /discover page's first statement is `if (!isDiscoverEnabled()) notFound()`.
// These pin the gate's behavior in the two environments a buyer could create.
describe('discover gate contract', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('a buyer install (no flag) is gated off', () => {
    vi.stubEnv('CVFORGE_DISCOVER', '')
    expect(isDiscoverEnabled()).toBe(false)
  })

  it('the deployed demo is gated off even with the flag', () => {
    vi.stubEnv('CVFORGE_DISCOVER', '1')
    vi.stubEnv('CVFORGE_MODE', 'demo')
    expect(isDiscoverEnabled()).toBe(false)
  })
})
