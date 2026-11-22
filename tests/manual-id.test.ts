import { describe, expect, it } from 'vitest'
import { manualId } from '@/lib/manual-id'

describe('manualId', () => {
  it('never reads as a sequential import id, even when the random hex is all digits', () => {
    // The flake this replaces: randomUUID().slice(0, 8) gave "36229741".
    const id = manualId('exp', () => '36229741-0000-4000-8000-000000000000')
    expect(id).toMatch(/^exp_[a-f][0-9a-f]{7}$/)
    expect(id).not.toMatch(/^exp_\d+$/)
    expect(id.slice(5)).toBe('6229741')
  })

  it('every lead maps into a–f', () => {
    for (const lead of '0123456789abcdef') {
      const id = manualId('proj', () => `${lead}0000000-0000`)
      expect(id).toMatch(/^proj_[a-f]0{7}$/)
    }
  })

  it('defaults to a random UUID', () => {
    expect(manualId('exp')).toMatch(/^exp_[a-f][0-9a-f]{7}$/)
  })
})
