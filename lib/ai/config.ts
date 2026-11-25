/** Pinned by spec. Effort varies per stage; the model does not — by default. */
export const MODEL = 'claude-opus-5' as const

/**
 * Thinking is on by default on claude-opus-5, and max_tokens caps thinking
 * PLUS output together — a tight value truncates mid-answer rather than
 * failing loudly, so it is set generously everywhere.
 */
export const MAX_TOKENS = 16_000

/**
 * The most a non-streaming call may ask for: the SDK refuses one whose
 * max_tokens implies more than ten minutes (≈21,333 tokens). A stage that
 * needs more than MAX_TOKENS (the interview prep) asks up to this.
 */
export const MAX_TOKENS_CEILING = 21_000

/**
 * What a stage asks for first when it runs on Rumbo's free trial. The trial
 * server holds a call's worst case (input + max_tokens at the output price)
 * against the person's budget before forwarding it, so the default 16,000
 * held $0.40 per Opus call for steps that write a tenth of that: a CV step
 * held ~$0.45 to spend ~$0.22, and a trial of $1.50 refused the CV once
 * ~$1.05 was spent (2026-11-25, a real visitor, 12 calls in).
 *
 * Each value is the largest output (thinking included) the step has ever
 * produced in api_calls (2026-11-25, 1,000+ calls), with at least a third
 * more on top; the CV import steps, whose output grows with the CV and
 * have only 3 samples, get several times theirs. A step cut off by its
 * allowance is asked once more at the full one (callStructured), so a
 * value that proves small costs a retry, never a broken step. Only the
 * trial uses these: with the person's own key nothing is held, and the
 * full allowance stays.
 */
const TRIAL_OPENING_TOKENS: Record<string, number> = {
  'compose-cv': 14_000, // max seen 10,215
  'compose-cover-letter': 5_000, // 2,630
  'translate-cv': 6_000, // 3,167
  'verify-distortion': 6_000, // 3,539
  'map-evidence': 6_000, // 3,716
  'extract-requirements': 5_000, // 2,861
  'parse-cv-evidence': 8_000, // 942 (3 samples; grows with the CV)
  'parse-cv-profile': 4_000, // 530 (3 samples)
}

/** The allowance a call opens with: smaller on the trial for a known stage. */
export function openingTokens(stage: string | undefined, full: number, onTrial: boolean): number {
  const opening = onTrial && stage ? TRIAL_OPENING_TOKENS[stage] : undefined
  return opening ? Math.min(opening, full) : full
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Per-stage model override, for measuring a cheaper model on one stage
 * without touching the others: `CVFORGE_MODEL_EXTRACT_REQUIREMENTS=
 * claude-haiku-4-5 npm run eval`. Unset means the pinned model. This is an
 * experiment surface, read from the environment only — a shipped routing
 * decision belongs here as code, once `npm run eval` has justified it.
 */
export function modelFor(stage?: string): string {
  if (!stage) return MODEL
  const key = `CVFORGE_MODEL_${stage.toUpperCase().replace(/-/g, '_')}`
  return (typeof process === 'undefined' ? undefined : process.env[key]) || ROUTED[stage] || MODEL
}

/**
 * Stages moved off the pinned model, each justified by `npm run eval`.
 *
 * Analysis (2026-11-22): three eval runs of claude-sonnet-5-5 on both triage
 * stages gave the same verdict as Opus on 21 of 21 fixture runs, at $0.039
 * per analysis against Opus's $0.110 (api_calls, 206 analyses). One
 * systematic difference: on one fixture it never marks "B2B SaaS", "CSS" or
 * "Background check" mandatory — none of them a gating kind, no verdict
 * moved. Writing (compose-*, verify-distortion) stays on Opus: that is
 * where "never invents" lives, and the eval does not exercise it.
 */
const ROUTED: Record<string, string> = {
  'extract-requirements': 'claude-sonnet-5-5',
  'map-evidence': 'claude-sonnet-5-5',
}

/**
 * The reasoning parameters a model accepts. Haiku 4.5 rejects adaptive
 * thinking and `output_config.effort` with a 400; it takes a fixed thinking
 * budget instead. Everything current in the Opus/Sonnet 5 line takes
 * adaptive thinking plus effort.
 */
export function reasoningFor(
  model: string,
  effort: Effort,
): { thinking: Record<string, unknown>; effort?: Effort } {
  if (/haiku-4-5/.test(model)) {
    return { thinking: { type: 'enabled', budget_tokens: 4000 } }
  }
  return { thinking: { type: 'adaptive' }, effort }
}
