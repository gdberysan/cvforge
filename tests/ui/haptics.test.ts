// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { haptic, hapticsOn, setHapticsOn } from '@/lib/ui/haptics'

let vibrate: ReturnType<typeof vi.fn>
let now = 1_000_000

beforeEach(() => {
  vibrate = vi.fn(() => true)
  vi.stubGlobal('navigator', { ...navigator, vibrate })
  // Each test starts far from the last pulse, so throttling never leaks between tests.
  now += 60_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('haptic', () => {
  it('gives each moment its own pulse', () => {
    haptic('tick')
    haptic('confirm')
    haptic('done')
    haptic('failed')
    expect(vibrate.mock.calls).toEqual([[8], [12], [[10, 60, 10]], [[30, 60, 30]]])
  })

  it('is one pulse per touch, even when a finger fires twice', () => {
    haptic('tick')
    now += 20
    haptic('tick')
    expect(vibrate).toHaveBeenCalledTimes(1)
    now += 50
    haptic('tick')
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('never buzzes twice for one result', () => {
    haptic('done')
    now += 300
    haptic('done')
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('is on by default and stays quiet once turned off on this device', () => {
    expect(hapticsOn()).toBe(true)
    setHapticsOn(false)
    expect(hapticsOn()).toBe(false)
    haptic('confirm')
    expect(vibrate).not.toHaveBeenCalled()
    setHapticsOn(true)
    haptic('confirm')
    expect(vibrate).toHaveBeenCalledWith(12)
  })

  it('does nothing, and never throws, where the browser cannot vibrate', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined })
    expect(() => haptic('done')).not.toThrow()
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: () => {
        throw new Error('blocked')
      },
    })
    expect(() => haptic('failed')).not.toThrow()
  })

  it('treats storage it cannot read as on', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(hapticsOn()).toBe(true)
  })
})
