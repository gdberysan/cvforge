import { afterEach, describe, expect, it } from 'vitest'
import { MODEL, modelFor, reasoningFor } from '@/lib/ai/config'
import { computeCostUsd, rateFor } from '@/lib/spend/cost'

afterEach(() => {
  delete process.env.CVFORGE_MODEL_EXTRACT_REQUIREMENTS
})

describe('modelFor', () => {
  it('runs analysis on Sonnet 5.5 and writing on the pinned model', () => {
    expect(modelFor('extract-requirements')).toBe('claude-sonnet-5-5')
    expect(modelFor('map-evidence')).toBe('claude-sonnet-5-5')
    // Where "never invents" lives: not moved until an eval covers it.
    for (const stage of [
      'compose-cv',
      'compose-cover-letter',
      'verify-distortion',
      'parse-cv-evidence',
    ]) {
      expect(modelFor(stage)).toBe(MODEL)
    }
    expect(modelFor(undefined)).toBe(MODEL)
  })

  it('lets the environment route any one stage, for measuring', () => {
    process.env.CVFORGE_MODEL_EXTRACT_REQUIREMENTS = 'claude-haiku-4-5'
    expect(modelFor('extract-requirements')).toBe('claude-haiku-4-5')
    expect(modelFor('map-evidence')).toBe('claude-sonnet-5-5')
  })
})

describe('reasoningFor', () => {
  it('sends adaptive thinking and effort to the Opus line', () => {
    expect(reasoningFor('claude-opus-5', 'low')).toEqual({
      thinking: { type: 'adaptive' },
      effort: 'low',
    })
  })

  it('sends a fixed budget and no effort to Haiku 4.5, which 400s on both', () => {
    const r = reasoningFor('claude-haiku-4-5', 'high')
    expect(r.thinking).toEqual({ type: 'enabled', budget_tokens: 4000 })
    expect(r.effort).toBeUndefined()
  })
})

describe('rates by model', () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
  it('bills Haiku 4.5 at a fifth of Opus on input', () => {
    expect(computeCostUsd(tokens, 'claude-haiku-4-5')).toBeCloseTo(1)
    expect(computeCostUsd(tokens, 'claude-opus-5')).toBeCloseTo(5)
    expect(computeCostUsd(tokens)).toBeCloseTo(5)
  })
  it('bills Sonnet 5.5 at $2 / $10, its cache reads at $0.10', () => {
    expect(computeCostUsd(tokens, 'claude-sonnet-5-5')).toBeCloseTo(2)
    expect(
      computeCostUsd(
        { ...tokens, inputTokens: 0, cacheReadTokens: 1_000_000 },
        'claude-sonnet-5-5',
      ),
    ).toBeCloseTo(0.1)
    expect(
      computeCostUsd({ ...tokens, inputTokens: 0, outputTokens: 1_000_000 }, 'claude-sonnet-5-5'),
    ).toBeCloseTo(10)
  })
  it('never bills an unknown model at zero', () => {
    expect(rateFor('claude-something-new')).toEqual(rateFor('claude-opus-5'))
  })
})
