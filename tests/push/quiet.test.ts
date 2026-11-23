import { describe, expect, it } from 'vitest'
import { inQuietHours, quietEnds } from '@/lib/push/quiet'

const Q = { start: 22, end: 8 }
const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m)

describe('quiet hours', () => {
  it('spans midnight', () => {
    expect(inQuietHours(at(23), Q)).toBe(true)
    expect(inQuietHours(at(3), Q)).toBe(true)
    expect(inQuietHours(at(8), Q)).toBe(false)
    expect(inQuietHours(at(21, 59), Q)).toBe(false)
  })

  it('ends at the next end hour, today or tomorrow', () => {
    expect(quietEnds(at(23), Q)).toEqual(new Date(2026, 9, 16, 8, 0))
    expect(quietEnds(at(3), Q)).toEqual(new Date(2026, 9, 15, 8, 0))
  })

  it('treats equal start and end as no quiet hours', () => {
    expect(inQuietHours(at(3), { start: 0, end: 0 })).toBe(false)
  })

  it('handles a window that does not span midnight', () => {
    expect(inQuietHours(at(13), { start: 12, end: 14 })).toBe(true)
    expect(inQuietHours(at(14), { start: 12, end: 14 })).toBe(false)
  })
})
