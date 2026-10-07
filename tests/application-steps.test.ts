import { describe, expect, it } from 'vitest'
import { currentStep, isStep, nextStep, type StepFacts, stepStates } from '@/lib/application-steps'

const coverage = {
  mandatoryTotal: 5,
  mandatoryStrong: 3,
  mandatoryPartial: 0,
  mandatoryMissing: 2,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  verdict: 'worth-it' as const,
}

const fresh: StepFacts = { status: 'triaged', coverage, hasCv: false, outcomes: [] }

describe('application steps', () => {
  it('opens where the application actually is', () => {
    expect(currentStep(fresh)).toBe('decide')
    expect(currentStep({ ...fresh, status: 'drafting' })).toBe('docs')
    expect(currentStep({ ...fresh, status: 'drafting', hasCv: true })).toBe('send')
    expect(
      currentStep({
        ...fresh,
        status: 'applied',
        hasCv: true,
        outcomes: [{ at: '2026-10-01T00:00:00.000Z', type: 'applied' }],
      }),
    ).toBe('track')
    expect(currentStep({ ...fresh, status: 'archived' })).toBe('decide')
  })

  it('marks gaps done only when no mandatory requirement is uncovered', () => {
    expect(stepStates(fresh).gaps).toEqual({ done: false, count: 2 })
    expect(stepStates({ ...fresh, coverage: { ...coverage, mandatoryMissing: 0 } }).gaps.done).toBe(
      true,
    )
  })

  it('walks the steps in order and validates the query value', () => {
    expect(nextStep('decide')).toBe('gaps')
    expect(nextStep('track')).toBeNull()
    expect(isStep('docs')).toBe(true)
    expect(isStep('nope')).toBe(false)
  })
})
