import { describe, expect, it } from 'vitest'
import { closeCall } from '@/lib/coverage'
import type { Coverage } from '@/lib/schemas'

const coverage = (over: Partial<Coverage>): Coverage => ({
  mandatoryTotal: 10,
  mandatoryStrong: 0,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  unjudgedGates: [],
  verdict: 'stretch',
  ...over,
})

describe('closeCall', () => {
  it('says which way one requirement read one step differently would tip it', () => {
    // 7 strong, 1 partial, 2 missing: worth-it; one more strong is 80% → strong;
    // one partial read as missing leaves 70% met but 3 missing → stretch.
    expect(
      closeCall(
        coverage({
          mandatoryStrong: 7,
          mandatoryPartial: 1,
          mandatoryMissing: 2,
          verdict: 'worth-it',
        }),
      ),
    ).toEqual({ up: 'strong', down: 'stretch' })
  })

  it('is quiet when one step changes nothing', () => {
    expect(closeCall(coverage({ mandatoryStrong: 10, verdict: 'strong' }))).toEqual({
      up: null,
      down: null,
    })
    expect(closeCall(coverage({ mandatoryMissing: 10, verdict: 'stretch' }))).toEqual({
      up: null,
      down: null,
    })
  })

  it('never calls a gated posting close', () => {
    const gated = coverage({
      mandatoryStrong: 9,
      mandatoryMissing: 1,
      hardBlockers: [{ id: 'r1' } as never],
      verdict: 'skip',
    })
    expect(closeCall(gated)).toEqual({ up: null, down: null })
  })
})
