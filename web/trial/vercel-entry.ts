/**
 * The Vercel Function at /api/trial (rewritten from /trial/*), bundled by
 * scripts/web-site.ts into web/site/api/trial.mjs. Configuration is the
 * project's environment; anything missing keeps the trial closed.
 */
import { handleTrial } from './proxy'
import { upstashStore } from './store'

const env = process.env
const storeUrl = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
const storeToken = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Longer than the app's own ten-minute wait for any model call, so Vercel
// never cuts a call before its real cost is settled (Pro allows 800).
export const maxDuration = 800

export async function POST(request: Request): Promise<Response> {
  // The address Vercel saw the connection from. x-real-ip is Vercel's own; in
  // x-forwarded-for a client can prepend anything, so only the entry Vercel
  // appends (the last) is read, never the first.
  const address =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    'unknown'
  return handleTrial(request, address, {
    secret: env.TRIAL_SECRET,
    anthropicKey: env.TRIAL_ANTHROPIC_KEY,
    store: storeUrl && storeToken ? upstashStore(storeUrl, storeToken) : undefined,
    open: env.TRIAL_OPEN !== 'off',
    budgetUsd: num(env.TRIAL_BUDGET_USD, 1.5),
    monthlyUsd: num(env.TRIAL_MONTHLY_USD, 90),
    startsPerAddressPerDay: num(env.TRIAL_STARTS_PER_DAY, 3),
    callsPerAddressPerHour: num(env.TRIAL_CALLS_PER_HOUR, 60),
    now: () => Date.now(),
    upstream: fetch,
    randomId: () => Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url'),
  })
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ state: 'method' }), { status: 405 })
}
