import { describe, expect, it } from 'vitest'
import {
  currentStep,
  isStep,
  nextStep,
  resolveStep,
  STEPS,
  type StepFacts,
  stepStates,
  visibleSteps,
  WORK_STEPS,
} from '@/lib/application-steps'

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
  unjudgedGates: [],
  verdict: 'worth-it' as const,
}

const interview = { at: '2026-10-16T00:00:00.000Z', type: 'interview' as const }
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
    expect(nextStep('track', visibleSteps({ ...fresh, outcomes: [interview] }))).toBe('prep')
    expect(nextStep('prep', visibleSteps({ ...fresh, outcomes: [interview] }))).toBeNull()
    expect(isStep('docs')).toBe(true)
    expect(isStep('nope')).toBe(false)
  })

  it('puts the overview first, done, and outside the numbered sequence', () => {
    expect(STEPS[0]).toBe('overview')
    expect(isStep('overview')).toBe(true)
    expect(WORK_STEPS).toEqual(['decide', 'gaps', 'docs', 'send', 'track', 'prep'])
    expect(stepStates(fresh).overview).toEqual({ done: true })
    // It has its own step buttons, so no "Next" link, and it is never where the work is.
    expect(nextStep('overview')).toBeNull()
    for (const status of ['triaged', 'drafting', 'applied', 'archived'] as const) {
      expect(currentStep({ ...fresh, status })).not.toBe('overview')
    }
  })

  it('shows Prepárate only once a screen or an interview is logged', () => {
    expect(visibleSteps(fresh)).toEqual(['decide', 'gaps', 'docs', 'send', 'track'])
    const applied = { at: '2026-10-07T00:00:00.000Z', type: 'applied' as const }
    expect(visibleSteps({ ...fresh, outcomes: [applied] })).not.toContain('prep')
    expect(visibleSteps({ ...fresh, outcomes: [applied, interview] })).toContain('prep')
    expect(visibleSteps({ ...fresh, outcomes: [{ ...interview, type: 'screen' }] })).toContain(
      'prep',
    )
    expect(isStep('prep')).toBe(true)
  })

  it('opens a step the application does not show on the overview, never a blank page', () => {
    const shown = visibleSteps(fresh)
    expect(resolveStep('prep', undefined, shown)).toBe('overview')
    expect(resolveStep('prep', undefined, visibleSteps({ ...fresh, outcomes: [interview] }))).toBe(
      'prep',
    )
    expect(resolveStep('docs', undefined, shown)).toBe('docs')
    expect(resolveStep('overview', undefined, shown)).toBe('overview')
    expect(resolveStep(undefined, '1', shown)).toBe('gaps')
    expect(resolveStep('nonsense', undefined, shown)).toBe('overview')
  })
})
