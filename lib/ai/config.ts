/** Pinned by spec. Effort varies per stage; the model does not — by default. */
export const MODEL = 'claude-opus-5' as const

/**
 * Thinking is on by default on claude-opus-5, and max_tokens caps thinking
 * PLUS output together — a tight value truncates mid-answer rather than
 * failing loudly, so it is set generously everywhere.
 */
export const MAX_TOKENS = 16_000

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
  return process.env[key] || MODEL
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
