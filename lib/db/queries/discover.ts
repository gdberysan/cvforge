import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { dismissedJobs } from '../schema'

/**
 * Discover-only (spec 2026-08-26): jobs the user hid from search results.
 * Dismissal only records the id, so the "hidden" toggle can list and restore a
 * dismissed job while it is among the current search's results — restore is not
 * a global list. Nothing is destructive: the job stays filtered from future
 * searches until restored, and re-running the search that surfaced it brings
 * the restore affordance back.
 */
export function listDismissedJobIds(db: Db): string[] {
  return db
    .select({ jobId: dismissedJobs.jobId })
    .from(dismissedJobs)
    .all()
    .map((row) => row.jobId)
}

export function dismissJob(db: Db, jobId: string): void {
  db.insert(dismissedJobs).values({ jobId }).onConflictDoNothing().run()
}

export function restoreJob(db: Db, jobId: string): void {
  db.delete(dismissedJobs).where(eq(dismissedJobs.jobId, jobId)).run()
}
