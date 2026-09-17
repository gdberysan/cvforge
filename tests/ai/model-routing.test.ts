import { afterEach, describe, expect, it } from 'vitest'
import { MODEL, modelFor, reasoningFor } from '@/lib/ai/config'
import { computeCostUsd, rateFor } from '@/lib/spend/cost'

afterEach(() => {
  delete process.env.CVFORGE_MODEL_EXTRACT_REQUIREMENTS
})

describe('modelFor', () => {
  it('is the pinned model unless the environment routes that exact stage', () => {
    expect(modelFor('extract-requirements')).toBe(MODEL)
    process.env.CVFORGE_MODEL_EXTRACT_REQUIREMENTS = 'claude-haiku-4-5'
    expect(modelFor('extract-requirements')).toBe('claude-haiku-4-5')
    expect(modelFor('map-evidence')).toBe(MODEL)
    expect(modelFor(undefined)).toBe(MODEL)
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
  it('never bills an unknown model at zero', () => {
    expect(rateFor('claude-something-new')).toEqual(rateFor('claude-opus-5'))
  })
})
