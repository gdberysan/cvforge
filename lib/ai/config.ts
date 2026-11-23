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
