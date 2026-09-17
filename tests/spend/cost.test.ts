import { describe, expect, it } from 'vitest'
import { computeCostUsd, formatUsd } from '@/lib/spend/cost'

describe('computeCostUsd', () => {
  it('prices claude-opus-5 tokens at the published rates', () => {
    // $5/1M input, $25/1M output, $0.50/1M cache reads, $6.25/1M cache writes.
    expect(
      computeCostUsd({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBeCloseTo(5 + 25 + 0.5 + 6.25, 6)
  })

  it('prices a realistic triage call in fractions of a cent territory', () => {
    const cost = computeCostUsd({
      inputTokens: 1_200,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 600,
    })
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(0.05)
  })
})

describe('formatUsd', () => {
  it('keeps sub-dollar amounts legible instead of rounding to $0.00', () => {
    expect(formatUsd(0.0042)).toBe('$0.0042')
  })

  it('uses plain cents once the amount is a dollar or more', () => {
    expect(formatUsd(12.3456)).toBe('$12.35')
  })

  it('shows an exact zero as zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })
})
