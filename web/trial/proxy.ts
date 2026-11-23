/**
 * The free trial (2026-11-23): a person without an Anthropic key can read
 * their CV, analyse a posting and get a tailored CV, paid by Rumbo, before
 * deciding to get a key. The app speaks to this exactly as it speaks to
 * Anthropic (the SDK, with this as its base URL and the trial pass as its
 * key); this forwards the call with the real key, after checking it is one
 * the app makes, and charges what it cost to that trial.
 *
 * What it keeps: numbers only (each trial's spend, the month's spend, how
 * often a network asks, as a keyed one-way code: never its address), under
 * opaque keys. Never a body: the CV, the
 * posting and the answer pass through memory and are gone.
 *
 * Limits, each enough on its own to bound the bill:
 * - each trial has a budget (TRIAL_BUDGET_USD) and lasts seven days;
 * - all trials share a day's budget (TRIAL_DAILY_USD) and a month's
 *   (TRIAL_MONTHLY_USD), below the hard cap set on the Anthropic workspace
 *   whose key this holds;
 * - a network (an IPv4 address, or an IPv6 /64) may start a few trials a day
 *   and make so many calls an hour;
 * - only the app's own call shape is forwarded: its models, its token cap,
 *   one user turn of text, PDFs and images carried in the call, no tools;
 * - each call's input is counted by Anthropic before it runs, and its worst
 *   case (that input plus every output token it may ask for) is reserved
 *   against all three budgets at once, then settled to the real cost.
 */
import Anthropic from '@anthropic-ai/sdk'
import { computeCostUsd, rateFor } from '../../lib/spend/cost'
import { networkCode } from './network'
import type { TrialStore } from './store'
import { issueToken, readPass } from './token'

export type TrialConfig = {
  /** HMAC secret for trial passes. Absent: the trial is closed. */
  secret?: string
  /** The Anthropic key the trial spends. Absent: the trial is closed. */
  anthropicKey?: string
  store?: TrialStore
  /** 'off' closes the trial without a deploy (an env change and a redeploy). */
  open?: boolean
  budgetUsd: number
  monthlyUsd: number
  /** All trials' spend in one UTC day: a drain costs a day, not the month. */
  dailyUsd: number
  startsPerAddressPerDay: number
  callsPerAddressPerHour: number
  now: () => number
  upstream: typeof fetch
  randomId: () => string
}

export const ALLOWED_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5-5'])
export const MAX_TOKENS_ALLOWED = 21_000
// Just under the 4.5 MB Vercel lets a function receive.
export const MAX_BODY_BYTES = 4_400_000
const TRIAL_DAYS = 7

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })
}

/** The shape the SDK reads errors from, so the app classifies them as usual. */
function apiError(status: number, type: string, message: string): Response {
  return json(status, { type: 'error', error: { type, message } })
}

const month = (now: number) => new Date(now).toISOString().slice(0, 7)
const day = (now: number) => new Date(now).toISOString().slice(0, 10)
const hour = (now: number) => new Date(now).toISOString().slice(0, 13)

function isOpen(c: TrialConfig): c is TrialConfig & {
  secret: string
  anthropicKey: string
  store: TrialStore
} {
  return Boolean(c.open && c.secret && c.anthropicKey && c.store)
}

export async function handleTrial(
  request: Request,
  address: string,
  c: TrialConfig,
): Promise<Response> {
  // Vercel's rewrite names the operation (?op=); the path covers a direct call.
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const op =
    url.searchParams.get('op') ??
    (path.endsWith('/trial/start')
      ? 'start'
      : path.endsWith('/trial/status')
        ? 'status'
        : path.endsWith('/v1/messages')
          ? 'messages'
          : '')
  if (request.method !== 'POST') return json(405, { state: 'method' })

  if (op === 'start') return start(address, c)
  if (op === 'status') return status(request, c)
  if (op === 'messages') return forward(request, address, c)
  return json(404, { state: 'not-found' })
}

async function start(address: string, c: TrialConfig): Promise<Response> {
  if (!isOpen(c)) return json(503, { state: 'closed' })
  const now = c.now()
  if (
    (await c.store.get(`month:${month(now)}`)) >= c.monthlyUsd ||
    (await c.store.get(`day:${day(now)}`)) >= c.dailyUsd
  ) {
    return json(503, { state: 'closed' })
  }
  const starts = await c.store.add(
    `start:${await networkCode(c.secret, address)}:${day(now)}`,
    1,
    86_400,
  )
  if (starts > c.startsPerAddressPerDay) return json(429, { state: 'limit' })
  const id = c.randomId()
  const token = await issueToken(c.secret, id, now + TRIAL_DAYS * 86_400_000)
  return json(200, { state: 'started', token, budgetUsd: c.budgetUsd })
}

/** What a pass has left to spend: the one thing a trial may ask about itself. */
async function status(request: Request, c: TrialConfig): Promise<Response> {
  if (!isOpen(c)) return json(503, { state: 'closed' })
  const pass = await readPass(c.secret, request.headers.get('x-api-key') ?? '', c.now())
  if (!pass) return json(401, { state: 'invalid' })
  if (pass.expired) return json(410, { state: 'expired' })
  const spent = await c.store.get(`trial:${pass.id}`)
  return json(200, {
    state: 'ok',
    leftUsd: Math.max(0, c.budgetUsd - spent),
    budgetUsd: c.budgetUsd,
  })
}

async function forward(request: Request, address: string, c: TrialConfig): Promise<Response> {
  if (!isOpen(c)) return apiError(402, 'trial_unavailable', 'The free trial is closed for now.')
  const now = c.now()
  const pass = await readPass(c.secret, request.headers.get('x-api-key') ?? '', now)
  if (!pass) return apiError(401, 'authentication_error', 'This trial pass is not valid.')
  // An expired pass is a trial that ended, not a missing key.
  if (pass.expired) return apiError(402, 'trial_ended', 'This free trial has expired.')
  const id = pass.id

  const calls = await c.store.add(
    `calls:${await networkCode(c.secret, address)}:${hour(now)}`,
    1,
    3_600,
  )
  if (calls > c.callsPerAddressPerHour) {
    return apiError(429, 'rate_limit_error', 'Too many requests. Wait a little and retry.')
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return apiError(413, 'request_too_large', 'That file is larger than the free trial allows.')
  }
  const problem = checkBody(text)
  if (problem) return apiError(400, 'invalid_request_error', problem)
  const body = JSON.parse(text) as AppCall
  const client = new Anthropic({
    apiKey: c.anthropicKey,
    fetch: c.upstream,
    maxRetries: 0,
    // Under the function's own limit (800 s), above the app's longest call.
    timeout: 780_000,
  })

  // The call's exact input, counted by Anthropic (free) before anything is
  // reserved: a PDF's pages, images and the schema all priced as they will
  // be billed, whatever their size on the wire.
  let inputTokens: number
  try {
    const counted = await client.messages.countTokens({
      model: body.model,
      messages: body.messages,
      ...(body.system ? { system: body.system } : {}),
      ...(body.thinking ? { thinking: body.thinking } : {}),
      ...(body.output_config ? { output_config: body.output_config } : {}),
    } as never)
    inputTokens = counted.input_tokens
  } catch (error) {
    return upstreamError(error)
  }
  const reserve = reserveUsd(inputTokens, usesCache(body), body.model, body.max_tokens)
  // Never a reservation that could lower a counter.
  if (!(reserve > 0) || !Number.isFinite(reserve)) {
    return apiError(400, 'invalid_request_error', 'Bad request.')
  }

  // Reserve the call's worst case BEFORE forwarding it, atomically: a call
  // checked only against what was spent so far could, alone or sent many at
  // once, run far past the budget. Settled to the real cost afterwards.
  const counters = [
    { key: `trial:${id}`, ttl: TRIAL_DAYS * 86_400 * 2, limit: c.budgetUsd },
    { key: `day:${day(now)}`, ttl: 2 * 86_400, limit: c.dailyUsd },
    { key: `month:${month(now)}`, ttl: 40 * 86_400, limit: c.monthlyUsd },
  ]
  const taken: typeof counters = []
  const release = async () => {
    for (const k of taken) await c.store.add(k.key, -reserve, k.ttl)
  }
  for (const k of counters) {
    const after = await c.store.add(k.key, reserve, k.ttl)
    taken.push(k)
    if (after > k.limit) {
      await release()
      if (k.key.startsWith('trial:')) {
        // Used up only when what is left would not run even a small step;
        // otherwise only this step does not fit, and the trial goes on.
        return after - reserve >= c.budgetUsd - SMALLEST_STEP_USD
          ? apiError(402, 'trial_ended', 'This free trial is used up.')
          : apiError(
              402,
              'trial_unavailable',
              'What is left of this trial does not cover this step.',
            )
      }
      return apiError(402, 'trial_unavailable', 'The free trial is full for now.')
    }
  }
  const settle = async (costUsd: number) => {
    let total = 0
    for (const k of counters) {
      const after = await c.store.add(k.key, costUsd - reserve, k.ttl)
      if (k.key.startsWith('trial:')) total = after
    }
    return total
  }

  // Streamed from Anthropic and assembled here: the first bytes arrive at
  // once, so no idle-connection timeout can cut a long call after it was
  // billed. The browser still gets one ordinary message.
  let started = false
  let message: Anthropic.Message
  try {
    const stream = client.messages.stream(body as never)
    for await (const event of stream) {
      if (event.type === 'message_start') started = true
    }
    message = await stream.finalMessage()
  } catch (error) {
    // Refused before it began: nothing was billed, so the reservation goes
    // back. Lost after it began: Anthropic may have billed it, so the
    // reservation stays as its cost.
    if (started) await settle(reserve)
    else await release()
    return upstreamError(error)
  }

  const u = message.usage
  const cost = computeCostUsd(
    {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    },
    body.model,
  )
  const total = await settle(cost)
  return new Response(JSON.stringify(message), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-trial-left': Math.max(0, c.budgetUsd - total).toFixed(2),
    },
  })
}

/** An error from Anthropic, passed on in the shape the SDK reads. */
function upstreamError(error: unknown): Response {
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const body =
      error.error && typeof error.error === 'object'
        ? error.error
        : { type: 'error', error: { type: 'api_error', message: 'The AI service failed.' } }
    return json(error.status, body)
  }
  return apiError(502, 'api_error', 'Could not reach the AI service.')
}

/** What a step must at least be able to spend for the trial to go on. */
const SMALLEST_STEP_USD = 0.05

/**
 * The most a call can cost: its counted input (at the cache-write rate when
 * it marks a cache breakpoint, the dearer of the two) plus every output token
 * it may ask for, thinking included.
 */
export function reserveUsd(
  inputTokens: number,
  cached: boolean,
  model: string,
  maxTokens: number,
): number {
  const rate = rateFor(model)
  const perInput = cached ? Math.max(rate.input, rate.cacheWrite) : rate.input
  return inputTokens * perInput + maxTokens * rate.output
}

/** The call the app makes (lib/ai/client.ts), and nothing else. */
type AppCall = {
  model: string
  max_tokens: number
  messages: unknown[]
  system?: unknown[]
  thinking?: unknown
  output_config?: unknown
}

const TOP_LEVEL = new Set([
  'model',
  'max_tokens',
  'messages',
  'system',
  'thinking',
  'output_config',
])
const MEDIA = {
  document: new Set(['application/pdf']),
  image: new Set(['image/jpeg', 'image/png', 'image/webp']),
} as const

function usesCache(body: AppCall): boolean {
  return /"cache_control"/.test(JSON.stringify([body.system, body.messages]))
}

/** Why a content block is not one the app sends, or null when it is. */
function checkBlock(block: unknown): string | null {
  if (!block || typeof block !== 'object') return 'Content not allowed.'
  const b = block as Record<string, unknown>
  for (const k of Object.keys(b)) {
    if (!['type', 'text', 'source', 'cache_control'].includes(k)) return `${k} not allowed.`
  }
  if ('cache_control' in b) {
    const cc = b.cache_control as Record<string, unknown> | null
    // The app's five-minute cache only: no other type, no longer life.
    if (cc?.type !== 'ephemeral' || Object.keys(cc).some((k) => k !== 'type')) {
      return 'cache_control not allowed.'
    }
  }
  if (b.type === 'text')
    return typeof b.text === 'string' && !('source' in b) ? null : 'Text not allowed.'
  if (b.type === 'document' || b.type === 'image') {
    const s = b.source as Record<string, unknown> | null
    // Only data carried in the call: never a link or a stored file for the
    // trial's key to fetch, which would be billed without being counted here.
    if (
      s?.type !== 'base64' ||
      typeof s.data !== 'string' ||
      !MEDIA[b.type].has(String(s.media_type)) ||
      Object.keys(s).some((k) => !['type', 'media_type', 'data'].includes(k))
    ) {
      return 'Source not allowed.'
    }
    return 'text' in b ? 'Content not allowed.' : null
  }
  return 'Content not allowed.'
}

/** Why a body is not one the app sends, or null when it is. */
export function checkBody(text: string): string | null {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return 'Not JSON.'
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Not an object.'
  for (const k of Object.keys(body)) {
    if (!TOP_LEVEL.has(k)) return `${k} not allowed.`
  }
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) return 'Model not allowed.'
  // A whole number in range: a negative or fractional cap would make the
  // reservation negative and lower the counters for calls sent at once.
  if (
    typeof body.max_tokens !== 'number' ||
    !Number.isInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > MAX_TOKENS_ALLOWED
  ) {
    return 'max_tokens not allowed.'
  }
  // One user turn, as the app sends it: a string, or allowed blocks.
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length !== 1) return 'messages not allowed.'
  const turn = messages[0] as Record<string, unknown> | null
  if (turn?.role !== 'user' || Object.keys(turn).some((k) => k !== 'role' && k !== 'content')) {
    return 'messages not allowed.'
  }
  if (typeof turn.content !== 'string') {
    if (!Array.isArray(turn.content) || turn.content.length === 0) return 'messages not allowed.'
    for (const block of turn.content) {
      const why = checkBlock(block)
      if (why) return why
    }
  }
  if ('system' in body) {
    if (!Array.isArray(body.system)) return 'system not allowed.'
    for (const block of body.system) {
      if ((block as { type?: unknown })?.type !== 'text') return 'system not allowed.'
      const why = checkBlock(block)
      if (why) return why
    }
  }
  return null
}
