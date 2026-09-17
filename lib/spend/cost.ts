/**
 * First-party API rates, USD per token. Cache reads bill at 0.1x input,
 * cache writes at 1.25x. Keyed by model family because a stage may be
 * routed to a cheaper model (see modelFor in lib/ai/config.ts); an unknown
 * model bills at the pinned model's rate rather than at zero, so an
 * experiment can never make the counter read cheaper than reality.
 */
type Rate = { input: number; output: number; cacheRead: number; cacheWrite: number }

const perMillion = (input: number, output: number): Rate => ({
  input: input / 1_000_000,
  output: output / 1_000_000,
  cacheRead: (input * 0.1) / 1_000_000,
  cacheWrite: (input * 1.25) / 1_000_000,
})

const OPUS = perMillion(5, 25)
const RATES: [RegExp, Rate][] = [
  [/haiku-4-5/, perMillion(1, 5)],
  [/sonnet-5/, perMillion(2, 10)],
  [/opus-5|opus-4-[678]/, OPUS],
]

export function rateFor(model: string): Rate {
  return RATES.find(([pattern]) => pattern.test(model))?.[1] ?? OPUS
}

export type TokenCounts = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function computeCostUsd(t: TokenCounts, model = 'claude-opus-5'): number {
  const rate = rateFor(model)
  return (
    t.inputTokens * rate.input +
    t.outputTokens * rate.output +
    t.cacheReadTokens * rate.cacheRead +
    t.cacheWriteTokens * rate.cacheWrite
  )
}

/** Four decimals under a dollar — early calls cost fractions of a cent, and a
 *  counter stuck at $0.00 reads as broken rather than cheap. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(usd === 0 || usd >= 1 ? 2 : 4)}`
}
