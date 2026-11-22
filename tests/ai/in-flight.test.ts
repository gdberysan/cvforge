import { describe, expect, it } from 'vitest'
import { paidRunInFlight, trackPaidCall } from '@/lib/ai/in-flight'

describe('paid runs in flight', () => {
  it('holds a restore off while a call is open and while its result is being saved', async () => {
    let release: () => void = () => {}
    const call = trackPaidCall(() => new Promise<void>((r) => (release = r)))
    expect(paidRunInFlight()).toBe(true)
    release()
    await call
    // Just ended: the save that follows has not happened yet.
    expect(paidRunInFlight()).toBe(true)
    expect(paidRunInFlight(Date.now() + 16_000)).toBe(false)
  })

  it('counts a failed call as ended, never as open forever', async () => {
    await expect(trackPaidCall(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(paidRunInFlight(Date.now() + 16_000)).toBe(false)
  })
})
