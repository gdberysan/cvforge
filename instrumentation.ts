/**
 * Runs once per server instance, before any request is handled.
 *
 * Importing the DB layer here for its side effect registers the spend recorder
 * (see `lib/ai/spend-hook`). Without it, registration depended on some page
 * having been rendered first, so a cold server whose first request was
 * `/api/ai/parse-cv` — the one AI route that never touches the DB itself —
 * billed two Opus calls and recorded neither.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  await import('@/lib/db/client')
}
