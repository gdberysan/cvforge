'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { getApplication, setArchived } from '@/lib/db/queries/applications'
import { dismissJob } from '@/lib/db/queries/discover'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { linkedInJobId } from '@/lib/discover/annotate'

/**
 * Skip from the verdict card = archive. The row and its coverage stay for the
 * stats layer; the pipeline just stops showing it. Unarchiving from the
 * pipeline's skipped view brings it back with its real derived status.
 */
export async function skipApplicationAction(
  applicationId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (isDemo()) return demoBlock()
  setArchived(db, applicationId, true)
  // A LinkedIn posting skipped here is also skipped for the job agent: it
  // dedupes by this id, so the morning digest never offers it again.
  const jobId = linkedInJobId(getApplication(db, applicationId)?.sourceUrl ?? null)
  if (jobId) dismissJob(db, jobId)
  revalidatePath('/pipeline')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true as const }
}

/** The way back from a skip: the row returns with its real derived status. */
export async function restoreApplicationAction(
  applicationId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (isDemo()) return demoBlock()
  setArchived(db, applicationId, false)
  revalidatePath('/pipeline')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true as const }
}
