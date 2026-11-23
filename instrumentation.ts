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
  const { db } = await import('@/lib/db/client')
  if (process.env.CVFORGE_MODE === 'demo') return

  // Quiet hours hold notifications back (lib/push/notify.ts); something must
  // send them once the window closes, including those the satellite queued
  // from its own process. On globalThis: once per process, whichever module
  // registry runs this.
  const g = globalThis as unknown as { __cvforgePushFlush?: ReturnType<typeof setInterval> }
  if (!g.__cvforgePushFlush) {
    const { flushOutbox } = await import('@/lib/push/notify')
    g.__cvforgePushFlush = setInterval(() => {
      flushOutbox(db).catch((err) => console.error('[push] outbox flush failed', err))
    }, 60_000)
    g.__cvforgePushFlush.unref?.()
  }

  // Kits chased from the phone or Telegram are written here, in the server
  // process, where spend is recorded. It guards itself on globalThis too.
  const { startKitRunner } = await import('@/lib/kit/runner')
  startKitRunner(db)
}
