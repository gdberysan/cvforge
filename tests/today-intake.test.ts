import { describe, expect, it } from 'vitest'
import { intakeRequested } from '@/lib/today-intake'

describe('intakeRequested', () => {
  it('is false on a plain visit to Today', () => {
    expect(intakeRequested({})).toBe(false)
  })
  it('is true when Discover hands over a posting', () => {
    expect(intakeRequested({ li: '4479708477' })).toBe(true)
  })
  it('is true when the sample was asked for', () => {
    expect(intakeRequested({ sample: '1' })).toBe(true)
  })
  it('ignores an empty li', () => {
    expect(intakeRequested({ li: '' })).toBe(false)
  })
})
