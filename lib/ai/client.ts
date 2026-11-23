import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { readSettings } from '@/lib/settings'
import { type Effort, MAX_TOKENS, MAX_TOKENS_CEILING, modelFor, reasoningFor } from './config'
import { AiError, type AiErrorKind, classify, messageOf } from './errors'
import { trackPaidCall } from './in-flight'
import { reportSpend } from './spend-hook'

export type SystemBlock = {
  text: string
  /** Put a cache breakpoint after this block. Only for byte-stable content. */
  cache?: boolean
}

/**
 * User content is a plain string for text stages, or content blocks when a
 * stage sends a document — a PDF rides as a base64 document block the model
 * reads natively, text and layout both.
 */
export type UserBlock =
  | { type: 'text'; text: string }
  | {
      type: 'document'
      source: { type: 'base64'; media_type: 'application/pdf'; data: string }
    }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: 'image/jpeg' | 'image/png' | 'image/webp'
        data: string
      }
    }

/**
 * Constructed lazily. The SDK throws at construction when it cannot resolve
 * credentials, and doing that at module load would crash the whole app on
 * import rather than letting the UI route to a setup screen (spec §5.4).
 *
 * Credential order (product spec §4.1): environment → data/config.json →
 * whatever the SDK resolves on its own (an OAuth profile). When the env has
 * a key we pass nothing and let the SDK read it, so its own precedence holds.
 */
const globalForAi = globalThis as unknown as { __anthropic?: Anthropic }

/** A browser page or Worker: the web edition, where there is no process.env. */
export const inBrowser = (): boolean =>
  typeof window !== 'undefined' ||
  typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'

function getClient(): Anthropic {
  if (!globalForAi.__anthropic) {
    const env: Record<string, string | undefined> =
      typeof process === 'undefined' ? {} : process.env
    const envHasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)
    const fileKey = envHasKey ? undefined : readSettings().anthropicApiKey
    try {
      // maxRetries: 0 because the retry policy lives HERE — the SDK default
      // silently retries 429s and 529s twice, which turns "never retry a rate
      // limit" into three attempts.
      globalForAi.__anthropic = new Anthropic({
        ...(fileKey ? { apiKey: fileKey } : {}),
        maxRetries: 0,
        // The web edition calls Anthropic straight from the person's own
        // browser with their own key (CSP-locked page, no server of ours).
        ...(inBrowser() ? { dangerouslyAllowBrowser: true } : {}),
      })
    } catch (error) {
      throw new AiError('auth', 'No Anthropic credentials could be resolved', error)
    }
  }
  return globalForAi.__anthropic
}

/** After the Settings page writes a new key, the next call must see it. */
export function resetClient(): void {
  globalForAi.__anthropic = undefined
}

/**
 * The single entry point for every structured AI stage.
 *
 * Centralising it is what keeps the spec's Global Constraints true rather than
 * re-remembered per call site: pinned model, generous max_tokens, adaptive
 * thinking, no sampling parameters, no assistant prefill, and an API-enforced
 * output schema instead of hand-parsed JSON.
 */
type Usage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/**
 * Best-effort usage extraction from a failed SDK call. The shapes probed are
 * the ones the SDK is known to hang usage on (the error itself, its response
 * body, its nested error); a miss just means that failure goes unrecorded,
 * exactly as before.
 */
export function usageFromError(error: unknown): Usage | null {
  const candidates = [
    (error as { usage?: unknown })?.usage,
    (error as { response?: { usage?: unknown } })?.response?.usage,
    (error as { error?: { usage?: unknown } })?.error?.usage,
    (error as { body?: { usage?: unknown } })?.body?.usage,
  ]
  for (const c of candidates) {
    if (
      c &&
      typeof c === 'object' &&
      (typeof (c as Usage).input_tokens === 'number' ||
        typeof (c as Usage).output_tokens === 'number')
    ) {
      return c as Usage
    }
  }
  return null
}

type StructuredCall<T extends z.ZodTypeAny> = {
  schema: T
  system: SystemBlock[]
  user: string | UserBlock[]
  effort: Effort
  /** Names the pipeline stage on its spend row. */
  stage?: string
  /** A stage whose answer is long; capped at MAX_TOKENS_CEILING. */
  maxTokens?: number
}

/** One structured model call, counted as in flight so a restore waits for it (see in-flight.ts). */
export function callStructured<T extends z.ZodTypeAny>(
  opts: StructuredCall<T>,
): Promise<z.infer<T>> {
  return trackPaidCall(() => callStructuredUntracked(opts), {
    stage: opts.stage ?? 'unknown',
    model: modelFor(opts.stage),
  })
}

/**
 * Which failures are worth another try, and after how long. Overload is
 * transient, so one backoff. A refused or dropped connection never reached
 * the API, so it costs nothing to retry, and a flaky home connection drops in
 * bursts of seconds (2026-10-29: about one connect in five refused at once):
 * three backoffs outlast one. A rate limit is never retried — that only
 * deepens the hole — and neither is a timeout, which already waited ten
 * minutes and may have been billed.
 */
const RETRY_DELAYS_MS: Partial<Record<AiErrorKind, number[]>> = {
  overloaded: [1500],
  network: [2000, 5000, 15000],
}

async function callStructuredUntracked<T extends z.ZodTypeAny>(
  opts: StructuredCall<T>,
): Promise<z.infer<T>> {
  const model = modelFor(opts.stage)
  const reasoning = reasoningFor(model, opts.effort)
  const request = {
    model,
    max_tokens: Math.min(opts.maxTokens ?? MAX_TOKENS, MAX_TOKENS_CEILING),
    thinking: reasoning.thinking,
    output_config: {
      ...(reasoning.effort ? { effort: reasoning.effort } : {}),
      format: zodOutputFormat(opts.schema),
    },
    system: opts.system.map((block) => ({
      type: 'text' as const,
      text: block.text,
      ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    })),
    // Never a trailing assistant turn: prefills 400 on current models.
    messages: [{ role: 'user' as const, content: opts.user }],
  }

  // Anthropic bills a truncated or refused call the same as a good one, so
  // spend is recorded wherever a usage block can be found — success or
  // failure. Before this, a run of failures left the spend counter flat
  // while the user's console climbed.
  const recordUsage = (usage: Usage | null | undefined) => {
    if (!usage) return
    reportSpend({
      stage: opts.stage ?? 'unknown',
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    })
  }

  // messages.create, not messages.parse: parse() wraps create() and throws a
  // bare AnthropicError when the text block fails the schema — AFTER the
  // billed response has arrived, discarding its usage. Anthropic bills a
  // truncated or malformed answer the same as a good one, so the response
  // is taken as-is, its spend recorded, and the parsing done here.
  let response: Reply | undefined
  for (let attempt = 0; response === undefined; attempt++) {
    try {
      response = (await getClient().messages.create(request as never)) as Reply
    } catch (error) {
      if (error instanceof AiError) throw error
      recordUsage(usageFromError(error))
      const kind = classify(error)
      const delay = RETRY_DELAYS_MS[kind]?.[attempt]
      if (delay === undefined) {
        throw new AiError(
          kind,
          attempt === 0 ? `AI request failed (${kind})` : `Retry after ${kind} failed`,
          error,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  recordUsage(response.usage)

  // The first text block is the structured answer; thinking blocks precede
  // it. stop_reason tells truncation and refusal apart in the log — both used
  // to reach cvforge.log as the same "expected object, received null".
  const text = response.content?.find((b) => b.type === 'text')?.text
  const why = response.stop_reason ? ` (stop_reason=${response.stop_reason})` : ''
  if (typeof text !== 'string') {
    logRejection(opts.stage, `no text block in the response${why}`)
    throw new AiError('invalid-output', 'The model returned no text')
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    logRejection(opts.stage, `output is not JSON${why}: ${messageOf(error)}`)
    throw new AiError('invalid-output', 'The model returned malformed JSON', error)
  }

  const parsed = opts.schema.safeParse(raw)
  if (!parsed.success) {
    logRejection(
      opts.stage,
      `${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}${why}`,
    )
    throw new AiError('invalid-output', parsed.error.issues[0]?.message ?? 'Schema mismatch')
  }
  return parsed.data
}

type Reply = {
  content?: { type: string; text?: string }[]
  usage?: Usage
  stop_reason?: string | null
}

/**
 * "The model returned an unexpected shape. Retry; if it persists, the prompt
 * needs fixing" is the one error message the user cannot act on, and the one
 * whose cause we then threw away. An empty certification issuer from a
 * LinkedIn export and a max_tokens truncation reached the user identically.
 *
 * stderr, because that is what the packaged app tees into datos/cvforge.log.
 * Only the failing paths are named — never the CV that produced them.
 */
function logRejection(stage: string | undefined, detail: string): void {
  console.error(`[cvforge] invalid-output in ${stage ?? 'unknown'} — ${detail}`)
}
