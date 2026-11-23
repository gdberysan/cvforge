'use server'

import { isDiscoverEnabled } from '#discover'
import { db } from '@/lib/db/client'
import { dismissJob, restoreJob } from '@/lib/db/queries/discover'
import { demoBlock, isDemo } from '@/lib/demo/mode'

/**
 * The page's 404 gate does not bind POSTs, so each action re-checks the
 * flag itself; the job id is validated because it arrives from the client.
 *
 * Deliberately NO revalidatePath('/discover'): the page is force-dynamic and
 * re-reads dismissals on the next navigation anyway, while ResultCard removes
 * the card locally right now. Revalidating the current path would push a fresh
 * server render — re-scraping LinkedIn on every hide/restore — which is exactly
 * what this feature avoids (keep volume low). The DB write is all that persists.
 */
const allowed = (jobId: string): boolean => isDiscoverEnabled() && /^\d{6,}$/.test(jobId)

export async function dismissJobAction(jobId: string) {
  if (isDemo()) return demoBlock()
  if (!allowed(jobId)) return
  dismissJob(db, jobId)
}

export async function restoreJobAction(jobId: string) {
  if (isDemo()) return demoBlock()
  if (!allowed(jobId)) return
  restoreJob(db, jobId)
}
