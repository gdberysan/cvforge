import type { ApplicationStatus, Coverage, OutcomeEvent } from '@/lib/schemas'

/**
 * An application is a sequence, not a page: decide whether it is worth it,
 * close what gaps you honestly can, write the documents, send them, then
 * follow what happens. The page used to be one ~6,000px scroll that mixed
 * the deciding with the producing; each step is now its own focused screen.
 */
export const STEPS = ['decide', 'gaps', 'docs', 'send', 'track'] as const
export type Step = (typeof STEPS)[number]

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && (STEPS as readonly string[]).includes(value)
}

export type StepFacts = {
  status: ApplicationStatus
  coverage: Coverage
  hasCv: boolean
  outcomes: OutcomeEvent[]
}

/** Where the application actually is — the step the page opens on. */
export function currentStep(f: StepFacts): Step {
  // Any logged outcome means it was sent: from there on it is follow-up.
  if (f.outcomes.length > 0) return 'track'
  if (f.status === 'archived') return 'decide'
  if (f.hasCv) return 'send'
  if (f.status === 'drafting') return 'docs'
  return 'decide'
}

export type StepState = { done: boolean; count?: number }

/**
 * What each step's marker says. Never a judgement the code cannot make: a
 * gap step is "done" only when no mandatory requirement is left uncovered,
 * not when the user has looked at it.
 */
export function stepStates(f: StepFacts): Record<Step, StepState> {
  const sent = f.outcomes.length > 0
  const gaps = f.coverage.mandatoryMissing
  return {
    decide: { done: f.status !== 'triaged' && f.status !== 'archived' },
    gaps: { done: gaps === 0, count: gaps },
    docs: { done: f.hasCv },
    send: { done: sent },
    // No count here: a number beside a step reads as something still open.
    track: { done: f.status === 'offer' || f.status === 'closed' },
  }
}

/** The step after this one, or null at the end. */
export function nextStep(step: Step): Step | null {
  const i = STEPS.indexOf(step)
  return i < STEPS.length - 1 ? STEPS[i + 1] : null
}
