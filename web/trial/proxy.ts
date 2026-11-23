/**
 * The free trial (2026-11-23): a person without an Anthropic key can read
 * their CV, analyse a posting and get a tailored CV, paid by Rumbo, before
 * deciding to get a key. The app speaks to this exactly as it speaks to
 * Anthropic (the SDK, with this as its base URL and the trial pass as its
 * key); this forwards the call with the real key, after checking it is one
 * the app makes, and charges what it cost to that trial.
 *
 * What it keeps: numbers only (each trial's spend, the month's spend, how
 * often an address asks), under opaque keys. Never a body: the CV, the
 * posting and the answer pass through memory and are gone.
 *
 * Limits, each enough on its own to bound the bill:
 * - each trial has a budget (TRIAL_BUDGET_USD); past it, every call is 402;
 * - all trials share a month's budget (TRIAL_MONTHLY_USD), below the hard
 *   cap set on the Anthropic workspace whose key this holds;
 * - an address may start a few trials a day and make so many calls an hour;
 * - only the app's own call shape is forwarded: its models, its token cap,
 *   no tools, no streaming, a bounded body.
 */
import { computeCostUsd, rateFor } from '../../lib/spend/cost'
import type { TrialStore } from './store'
import { issueToken, readToken } from './token'

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
  startsPerAddressPerDay: number
  callsPerAddressPerHour: number
  now: () => number
  upstream: typeof fetch
  randomId: () => string
  /**
   * Tells the owner when the month's spend first crosses half, 80% and all of
   * its budget. Optional and unwired today: the monthly cap closes the trial
   * on its own; a channel the owner reads can be plugged in here.
   */
  notify?: (text: string) => Promise<void>
}

/** The shares of the month's budget the owner hears about, once each. */
export const ALERT_SHARES = [0.5, 0.8, 1] as const

export const ALLOWED_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5-5'])
export const MAX_TOKENS_ALLOWED = 21_000
export const MAX_BODY_BYTES = 2_500_000
const TRIAL_DAYS = 7
const ANTHROPIC = 'https://api.anthropic.com/v1/messages'

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
  if ((await c.store.get(`month:${month(now)}`)) >= c.monthlyUsd) {
    return json(503, { state: 'closed' })
  }
  const starts = await c.store.add(`start:${address}:${day(now)}`, 1, 86_400)
  if (starts > c.startsPerAddressPerDay) return json(429, { state: 'limit' })
  await c.store.add(`starts:${month(now)}`, 1, 40 * 86_400)
  const id = c.randomId()
  const token = await issueToken(c.secret, id, now + TRIAL_DAYS * 86_400_000)
  return json(200, { state: 'started', token, budgetUsd: c.budgetUsd })
}

/** What a pass has left to spend: the one thing a trial may ask about itself. */
async function status(request: Request, c: TrialConfig): Promise<Response> {
  if (!isOpen(c)) return json(503, { state: 'closed' })
  const id = await readToken(c.secret, request.headers.get('x-api-key') ?? '', c.now())
  if (!id) return json(401, { state: 'invalid' })
  const spent = await c.store.get(`trial:${id}`)
  return json(200, {
    state: 'ok',
    leftUsd: Math.max(0, c.budgetUsd - spent),
    budgetUsd: c.budgetUsd,
  })
}

async function forward(request: Request, address: string, c: TrialConfig): Promise<Response> {
  if (!isOpen(c)) return apiError(402, 'trial_ended', 'The free trial is closed.')
  const now = c.now()
  const id = await readToken(c.secret, request.headers.get('x-api-key') ?? '', now)
  if (!id) return apiError(401, 'authentication_error', 'This trial pass is not valid.')

  const calls = await c.store.add(`calls:${address}:${hour(now)}`, 1, 3_600)
  if (calls > c.callsPerAddressPerHour) {
    return apiError(429, 'rate_limit_error', 'Too many requests. Wait a little and retry.')
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return apiError(413, 'request_too_large', 'That is larger than a trial allows.')
  }
  const problem = checkBody(text)
  if (problem) return apiError(400, 'invalid_request_error', problem)
  const parsed = JSON.parse(text) as { model: string; max_tokens: number }
  const model = parsed.model

  // Reserve the call's worst case BEFORE forwarding it, atomically: a call
  // checked only against what was spent so far could, alone or sent many at
  // once, run far past the budget. Settled to the real cost afterwards.
  const reserve = worstCaseUsd(text, model, parsed.max_tokens)
  // Never a reservation that could lower a counter.
  if (!(reserve > 0) || !Number.isFinite(reserve)) {
    return apiError(400, 'invalid_request_error', 'Bad request.')
  }
  const trialKey = `trial:${id}`
  const monthKey = `month:${month(now)}`
  const trialTtl = TRIAL_DAYS * 86_400 * 2
  const monthTtl = 40 * 86_400
  const afterTrial = await c.store.add(trialKey, reserve, trialTtl)
  if (afterTrial > c.budgetUsd) {
    await c.store.add(trialKey, -reserve, trialTtl)
    return apiError(402, 'trial_ended', 'This free trial is used up.')
  }
  const afterMonth = await c.store.add(monthKey, reserve, monthTtl)
  if (afterMonth > c.monthlyUsd) {
    await c.store.add(trialKey, -reserve, trialTtl)
    await c.store.add(monthKey, -reserve, monthTtl)
    return apiError(402, 'trial_ended', 'The free trial is closed for this month.')
  }

  // Only what the app's calls need; nothing the browser sends is passed on
  // but the body and the API version.
  const version = request.headers.get('anthropic-version')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': c.anthropicKey,
    'anthropic-version': version && /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : '2023-06-01',
  }

  let reply: string
  let res: Response
  try {
    res = await c.upstream(ANTHROPIC, { method: 'POST', headers, body: text })
    reply = await res.text()
  } catch {
    // Never reached Anthropic, or the answer was lost: nothing billed that we
    // can see, so the reservation is returned.
    await c.store.add(trialKey, -reserve, trialTtl)
    await c.store.add(monthKey, -reserve, monthTtl)
    return apiError(502, 'api_error', 'Could not reach the AI service.')
  }

  // Settle: the real cost where usage came back (billed, success or not),
  // nothing where it did not.
  const usage = readUsage(reply)
  const cost = usage ? computeCostUsd(usage, model) : 0
  const total = await c.store.add(trialKey, cost - reserve, trialTtl)
  const monthTotal = await c.store.add(monthKey, cost - reserve, monthTtl)
  await alertOwner(c, now, monthTotal)
  const left = c.budgetUsd - total
  return new Response(reply, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
      'x-trial-left': Math.max(0, left).toFixed(2),
    },
  })
}

/**
 * The most a call can cost: its input read generously (text at ~3 characters
 * a token; an image or a PDF page by Anthropic's own sizing, bounded here by
 * its base64 length) plus every output token it may ask for.
 */
export function worstCaseUsd(text: string, model: string, maxTokens: number): number {
  let media = 0
  const plain = text.replace(/"data"\s*:\s*"([A-Za-z0-9+/=]*)"/g, (_m, data: string) => {
    // An image is at most ~1,600 tokens; a PDF ~3,000 a page, and a page is
    // rarely under ~40 KB of base64. Whichever is larger, never below an image.
    media += Math.max(1_600, Math.ceil(data.length / 40_000) * 3_000)
    return '""'
  })
  const rate = rateFor(model)
  return (plain.length / 3 + media) * rate.input + maxTokens * rate.output
}

/**
 * Each share of the month's budget is announced once, the first time a
 * settled call crosses it. Never fails a call: a message that cannot be sent
 * is a message not sent.
 */
async function alertOwner(c: TrialConfig & { store: TrialStore }, now: number, monthTotal: number) {
  if (!c.notify) return
  for (const share of ALERT_SHARES) {
    if (monthTotal < c.monthlyUsd * share) continue
    if (!(await c.store.claim(`alerted:${month(now)}:${share}`, 40 * 86_400))) continue
    const starts = await c.store.get(`starts:${month(now)}`)
    const text =
      share >= 1
        ? `Rumbo · prueba gratis: se llegó al tope del mes ($${monthTotal.toFixed(2)} de $${c.monthlyUsd}). Las pruebas quedan cerradas hasta el día 1; la app pide la clave propia. Pruebas empezadas este mes: ${starts}.`
        : `Rumbo · prueba gratis: este mes van $${monthTotal.toFixed(2)} de $${c.monthlyUsd} (${Math.round(share * 100)}%). Pruebas empezadas: ${starts}. Al llegar a $${c.monthlyUsd} se cierran solas.`
    await c.notify(text).catch(() => {})
  }
}

/** Why a body is not one the app sends, or null when it is. */
export function checkBody(text: string): string | null {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return 'Not JSON.'
  }
  if (!body || typeof body !== 'object') return 'Not an object.'
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) return 'Model not allowed.'
  // A whole number in range: a negative or fractional cap would make the
  // reservation below negative and lower the counters for calls sent at once.
  if (
    typeof body.max_tokens !== 'number' ||
    !Number.isInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > MAX_TOKENS_ALLOWED
  ) {
    return 'max_tokens not allowed.'
  }
  for (const k of ['tools', 'tool_choice', 'mcp_servers', 'container', 'stream']) {
    if (k in body && body[k] !== false) return `${k} not allowed.`
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 2) {
    return 'messages not allowed.'
  }
  return null
}

function readUsage(reply: string) {
  try {
    const u = (JSON.parse(reply) as { usage?: Record<string, number | null> }).usage
    if (!u) return null
    return {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    }
  } catch {
    return null
  }
}
