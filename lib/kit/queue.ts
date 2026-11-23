import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { applications, kitJobs } from '@/lib/db/schema'
import { kitDailyCap, kitOnChase } from '@/lib/settings'

/**
 * The background kit queue (spec 2026-10-15 agent stage A §6). A chase
 * enqueues; the server's runner (./runner.ts) claims one job at a time.
 * Times are the server's clock — the user's own Mac — so "today" and
 * "03:00" mean what the user means.
 */
export type KitJob = typeof kitJobs.$inferSelect

const OPEN = ['queued', 'running']

/** Never retried: no amount of waiting fixes an empty balance, a bad key,
 * or an application that was deleted while its kit waited. */
const FINAL = new Set(['billing', 'auth', 'not-found'])

const MAX_ATTEMPTS = 2

function dayBounds(now: Date): [string, string] {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString(), end.toISOString()]
}

/** The next 03:00 on the server's clock after `now`. */
function nextNight(now: Date): Date {
  const at = new Date(now)
  at.setHours(3, 0, 0, 0)
  if (at <= now) at.setDate(at.getDate() + 1)
  return at
}

export function openKitFor(db: Db, applicationId: string): KitJob | null {
  return (
    db
      .select()
      .from(kitJobs)
      .where(and(eq(kitJobs.applicationId, applicationId), inArray(kitJobs.state, OPEN)))
      .get() ?? null
  )
}

export function latestKitFor(db: Db, applicationId: string): KitJob | null {
  return (
    db
      .select()
      .from(kitJobs)
      .where(eq(kitJobs.applicationId, applicationId))
      .orderBy(desc(kitJobs.createdAt))
      .get() ?? null
  )
}

/**
 * One open kit per application — a chase from Telegram and one from the app
 * must not pay twice — and at most "Kits por día" enqueued per local day.
 */
export function enqueueKit(
  db: Db,
  applicationId: string,
  now: Date = new Date(),
): { ok: true; jobId: string } | { ok: false; reason: 'open' | 'cap' } {
  // One write transaction, taken before the check: Telegram's chase runs in
  // the satellite's process and the app's in the server's, and two taps at
  // the same instant must not both pass the check.
  return db.transaction(
    (tx): { ok: true; jobId: string } | { ok: false; reason: 'open' | 'cap' } => {
      if (openKitFor(tx, applicationId)) return { ok: false, reason: 'open' }
      const [start, end] = dayBounds(now)
      const today = tx
        .select({ id: kitJobs.id })
        .from(kitJobs)
        .where(and(gte(kitJobs.createdAt, start), lt(kitJobs.createdAt, end)))
        .all().length
      if (today >= kitDailyCap()) return { ok: false, reason: 'cap' }
      const id = `kit_${crypto.randomUUID()}`
      tx.insert(kitJobs)
        .values({ id, applicationId, state: 'queued', attempts: 0, createdAt: now.toISOString() })
        .run()
      return { ok: true, jobId: id }
    },
    { behavior: 'immediate' },
  )
}

/** A kit takes about three minutes; one "running" for this long was interrupted. */
const STUCK_MS = 15 * 60_000

/**
 * The oldest due job, marked running. Null when nothing is due or one is
 * already running. A row "running" for 15 minutes is taken as interrupted
 * and put back first — a restored backup or a crash mid-kit must not block
 * every later kit until the next restart.
 */
export function claimNext(db: Db, now: Date = new Date()): KitJob | null {
  const running = db.select().from(kitJobs).where(eq(kitJobs.state, 'running')).all()
  const stuckBefore = new Date(now.getTime() - STUCK_MS).toISOString()
  if (running.some((j) => j.startedAt !== null && j.startedAt > stuckBefore)) return null
  for (const j of running) {
    db.update(kitJobs)
      .set({ state: 'queued', attempts: Math.max(0, j.attempts - 1), startedAt: null })
      .where(eq(kitJobs.id, j.id))
      .run()
  }
  const job = db
    .select()
    .from(kitJobs)
    .where(
      and(
        eq(kitJobs.state, 'queued'),
        or(isNull(kitJobs.notBefore), lte(kitJobs.notBefore, now.toISOString())),
      ),
    )
    .orderBy(asc(kitJobs.createdAt))
    .get()
  if (!job) return null
  const attempts = job.attempts + 1
  db.update(kitJobs)
    .set({ state: 'running', attempts, startedAt: now.toISOString() })
    .where(eq(kitJobs.id, job.id))
    .run()
  return { ...job, state: 'running', attempts, startedAt: now.toISOString() }
}

/**
 * Done, or failed. A failure that waiting can fix goes back in the queue
 * once, held until 03:00 the next night, so its push lands by morning.
 */
export function finishKit(
  db: Db,
  id: string,
  result: { ok: true } | { ok: false; code: string },
  now: Date = new Date(),
): void {
  const job = db.select().from(kitJobs).where(eq(kitJobs.id, id)).get()
  if (!job) return
  if (result.ok) {
    db.update(kitJobs)
      .set({ state: 'done', errorCode: null, finishedAt: now.toISOString() })
      .where(eq(kitJobs.id, id))
      .run()
    return
  }
  const retry = job.attempts < MAX_ATTEMPTS && !FINAL.has(result.code)
  db.update(kitJobs)
    .set(
      retry
        ? {
            state: 'queued',
            errorCode: result.code,
            notBefore: nextNight(now).toISOString(),
            finishedAt: now.toISOString(),
          }
        : { state: 'failed', errorCode: result.code, finishedAt: now.toISOString() },
    )
    .where(eq(kitJobs.id, id))
    .run()
}

/**
 * Run once at boot: a job left `running` was interrupted (an install
 * restarts the server mid-kit). It goes back in the queue, and the try that
 * never finished does not count against its one retry.
 */
export function resetStale(db: Db): number {
  const stale = db.select().from(kitJobs).where(eq(kitJobs.state, 'running')).all()
  for (const job of stale) {
    db.update(kitJobs)
      .set({ state: 'queued', attempts: Math.max(0, job.attempts - 1), startedAt: null })
      .where(eq(kitJobs.id, job.id))
      .run()
  }
  return stale.length
}

/**
 * What a kit means to the person looking at its application: being written
 * (`working`), failed and waiting for its night retry (`retry`), or settled.
 * A waiting retry is still `queued`, which is why the state alone is not
 * enough to say "Preparando".
 */
export type KitPhase = 'none' | 'working' | 'retry' | 'done' | 'failed'

export function kitPhase(job: KitJob | null, now: Date = new Date()): KitPhase {
  if (!job) return 'none'
  if (job.state === 'done' || job.state === 'failed') return job.state
  if (job.state === 'queued' && job.notBefore && job.notBefore > now.toISOString()) return 'retry'
  return 'working'
}

/**
 * Is the background kit writing this application's CV and letter right now?
 * The "Generar" routes ask, so a page opened before a Telegram chase cannot
 * pay for the same documents a second time. A kit waiting for its night
 * retry does not count: generating by hand meanwhile is the user's call.
 */
export function kitWorking(db: Db, applicationId: string, now: Date = new Date()): boolean {
  return kitPhase(openKitFor(db, applicationId), now) === 'working'
}

/**
 * The kit a chase asks for, when it should: the switch is on, and the
 * application has no CV or cover letter yet. A chase that lands on an
 * application the user already wrote documents for — pasted by hand,
 * generated, edited — must never pay to overwrite them.
 */
export function enqueueChaseKit(
  db: Db,
  applicationId: string,
  now: Date = new Date(),
): 'queued' | 'off' | 'cap' | 'open' | 'has-docs' {
  if (!kitOnChase()) return 'off'
  const row = db
    .select({ documents: applications.documents })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .get()
  const docs = (row?.documents ?? null) as { cv?: unknown; coverLetter?: unknown } | null
  if (docs?.cv || docs?.coverLetter) return 'has-docs'
  const out = enqueueKit(db, applicationId, now)
  return out.ok ? 'queued' : out.reason
}

export type KitFailure = {
  id: string
  applicationId: string
  errorCode: string
  at: string
  jobTitle: string
  company: string
  /** True when the night retry is still to come. */
  willRetry: boolean
}

/**
 * Kits that failed after `since` (ISO), for the satellite to tell Telegram:
 * the spec's "errors always reach Telegram" includes a failed kit, and the
 * server has no Telegram of its own.
 */
export function kitFailuresSince(db: Db, since: string): KitFailure[] {
  return db
    .select({
      id: kitJobs.id,
      applicationId: kitJobs.applicationId,
      errorCode: kitJobs.errorCode,
      state: kitJobs.state,
      at: kitJobs.finishedAt,
      jobTitle: applications.jobTitle,
      company: applications.company,
    })
    .from(kitJobs)
    .leftJoin(applications, eq(applications.id, kitJobs.applicationId))
    .where(and(inArray(kitJobs.state, ['queued', 'failed']), gt(kitJobs.finishedAt, since)))
    .orderBy(asc(kitJobs.finishedAt))
    .all()
    .filter((r) => r.errorCode && r.at)
    .map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      errorCode: r.errorCode as string,
      at: r.at as string,
      jobTitle: r.jobTitle ?? '',
      company: (r.company ?? '').trim(),
      willRetry: r.state === 'queued',
    }))
}
