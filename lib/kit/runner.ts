import { AiError } from '@/lib/ai/errors'
import type { Db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { kitMessage } from '@/lib/push/messages'
import { notify as sendPush } from '@/lib/push/notify'
import { generateCompanion, generateCv } from './generate'
import { claimNext, finishKit, resetStale } from './queue'

type Deps = {
  cv?: typeof generateCv
  companion?: typeof generateCompanion
  notify?: typeof sendPush
  now?: () => Date
}

function codeOf(err: unknown): string {
  if (err instanceof AiError) return err.kind
  if (err instanceof Error && err.message === 'not-found') return 'not-found'
  return 'unexpected'
}

/**
 * Runs the oldest due kit: the CV, then the cover letter, each written and
 * saved exactly as the "Generar" buttons do (./generate.ts). One push for
 * the whole kit. A kit whose letter failed is a failed kit even though its
 * CV was saved — a half kit announced as ready would be a lie — and its one
 * retry writes only what is still missing: a CV already there, the kit's own
 * or one made (and maybe edited) by hand while the retry waited, is never
 * paid for twice or overwritten.
 *
 * Flag reasons are written in Spanish, the product's first language: the
 * runner has no request, so no locale cookie to read.
 */
export async function runKitOnce(db: Db, deps: Deps = {}): Promise<'idle' | 'done' | 'failed'> {
  const { cv = generateCv, companion = generateCompanion, notify = sendPush } = deps
  const now = deps.now ?? (() => new Date())
  const job = claimNext(db, now())
  if (!job) return 'idle'

  const app = getApplication(db, job.applicationId)
  // A night retry whose documents were written by hand since: nothing left
  // to buy, and no news to push.
  const docs = (app?.documents ?? null) as { cv?: unknown; coverLetter?: unknown } | null
  if (job.attempts > 1 && docs?.cv && docs.coverLetter) {
    finishKit(db, job.id, { ok: true }, now())
    return 'done'
  }
  const about = {
    jobTitle: app?.jobTitle ?? '',
    company: app?.company.trim() ?? '',
    applicationId: job.applicationId,
  }
  try {
    if (!docs?.cv) await cv(db, job.applicationId, { reasonLanguage: 'es' })
    if (!docs?.coverLetter) {
      await companion(db, job.applicationId, 'coverLetter', { reasonLanguage: 'es' })
    }
    finishKit(db, job.id, { ok: true }, now())
    await notify(db, kitMessage('es', { ok: true, ...about })).catch(() => {})
    return 'done'
  } catch (err) {
    const code = codeOf(err)
    finishKit(db, job.id, { ok: false, code }, now())
    // Nothing to open when the application is gone.
    if (code !== 'not-found')
      await notify(db, kitMessage('es', { ok: false, ...about })).catch(() => {})
    console.error(`[kit] ${job.applicationId} failed: ${code}`)
    return 'failed'
  }
}

const TICK_MS = 10_000

/**
 * Once per process, whichever module registry calls it (instrumentation.ts):
 * on globalThis, like the push flush. Resets kits an install interrupted,
 * then checks every ten seconds. One kit at a time: the busy flag skips a
 * tick while one runs, and `claimNext` refuses while a row is `running`.
 */
export function startKitRunner(db: Db): void {
  const g = globalThis as unknown as {
    __cvforgeKitRunner?: { timer: ReturnType<typeof setInterval>; busy: boolean }
  }
  if (g.__cvforgeKitRunner) return
  resetStale(db)
  const state = { timer: undefined as unknown as ReturnType<typeof setInterval>, busy: false }
  state.timer = setInterval(() => {
    if (state.busy) return
    state.busy = true
    runKitOnce(db)
      .catch((err) => console.error('[kit] runner tick failed', err))
      .finally(() => {
        state.busy = false
      })
  }, TICK_MS)
  state.timer.unref?.()
  g.__cvforgeKitRunner = state
}
