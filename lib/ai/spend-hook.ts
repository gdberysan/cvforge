/**
 * The AI client reports token usage here; the DB layer registers the recorder
 * at startup. The indirection keeps lib/ai free of database imports — the
 * client stays testable with only the SDK mocked, and a recording failure can
 * never break a paid API call that already succeeded.
 */

export type SpendRecord = {
  stage: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

type Recorder = (record: SpendRecord) => void

/**
 * On globalThis, not a module-level `let`, for the same reason the Anthropic
 * client is: Next builds route handlers into a different bundle than pages,
 * and each bundle gets its own module registry. A module-level recorder set
 * from one is null in the other, so `/api/ai/parse-cv` — the one AI route that
 * never touches the DB itself — recorded no spend at all, and a CV import's
 * two Opus calls stayed invisible while the Anthropic bill climbed. The
 * process-wide global is the one thing both bundles genuinely share.
 */
const globalForSpend = globalThis as unknown as { __cvforgeSpendRecorder?: Recorder | null }

export function setSpendRecorder(fn: Recorder | null): void {
  globalForSpend.__cvforgeSpendRecorder = fn
}

export function reportSpend(record: SpendRecord): void {
  try {
    globalForSpend.__cvforgeSpendRecorder?.(record)
  } catch {
    // Losing one spend row is acceptable; losing the response is not.
  }
}
