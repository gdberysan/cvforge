import type { ApplicationStatus, Coverage, OutcomeEvent } from '@/lib/schemas'

/**
 * An application is a sequence, not a page: decide whether it is worth it,
 * close what gaps you honestly can, write the documents, send them, then
 * follow what happens. The page used to be one ~6,000px scroll that mixed
 * the deciding with the producing; each step is now its own focused screen.
 *
 * `overview` comes first and is where the page opens (spec 2026-10-17 §2):
 * what the job is and where you stand. It is the page head, not a numbered
 * step — `WORK_STEPS` is the sequence the step navigation lists.
 */
export const STEPS = ['overview', 'decide', 'gaps', 'docs', 'send', 'track', 'prep'] as const
export type Step = (typeof STEPS)[number]

/**
 * The numbered steps: everything but the overview. `prep` (Prepárate, spec
 * 2026-10-18) exists only once a call is logged — see `visibleSteps`.
 */
export const WORK_STEPS = ['decide', 'gaps', 'docs', 'send', 'track', 'prep'] as const
export type WorkStep = (typeof WORK_STEPS)[number]

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && (STEPS as readonly string[]).includes(value)
}

export type StepFacts = {
  status: ApplicationStatus
  coverage: Coverage
  hasCv: boolean
  outcomes: OutcomeEvent[]
}

/**
 * Where the application actually is — the overview's next move. Never the
 * overview itself: that is where you look, not where the work is.
 */
export function currentStep(f: StepFacts): WorkStep {
  // Any logged outcome means it was sent: from there on it is follow-up.
  if (f.outcomes.length > 0) return 'track'
  if (f.status === 'archived') return 'decide'
  if (f.hasCv) return 'send'
  if (f.status === 'drafting') return 'docs'
  return 'decide'
}

/** The steps this application shows: Prepárate only once a screen or an interview is logged. */
export function visibleSteps(f: StepFacts): WorkStep[] {
  const hasCall = f.outcomes.some((o) => o.type === 'screen' || o.type === 'interview')
  return WORK_STEPS.filter((s) => s !== 'prep' || hasCall)
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
    overview: { done: true },
    decide: { done: f.status !== 'triaged' && f.status !== 'archived' },
    gaps: { done: gaps === 0, count: gaps },
    docs: { done: f.hasCv },
    send: { done: sent },
    // No count here: a number beside a step reads as something still open.
    track: { done: f.status === 'offer' || f.status === 'closed' },
    // A guide to read, never a task to tick off.
    prep: { done: false },
  }
}

/** The work step after this one, or null at the end (and on the overview, which has its own buttons). */
export function nextStep(
  step: Step,
  visible: readonly WorkStep[] = WORK_STEPS.filter((s) => s !== 'prep'),
): WorkStep | null {
  if (step === 'overview') return null
  const i = visible.indexOf(step)
  return i >= 0 && i < visible.length - 1 ? (visible[i + 1] ?? null) : null
}

/**
 * The step a URL asks for, or the overview when this application does not
 * show it: `?step=prep` before any call is logged used to render an empty page.
 */
export function resolveStep(
  param: string | undefined,
  gapdelta: string | undefined,
  shown: readonly WorkStep[],
): Step {
  const asked: Step = isStep(param) ? param : gapdelta ? 'gaps' : 'overview'
  return asked === 'overview' || (shown as readonly string[]).includes(asked) ? asked : 'overview'
}
