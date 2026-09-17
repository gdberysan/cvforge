'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { setArchived } from '@/lib/db/queries/applications'
import { demoBlock, isDemo } from '@/lib/demo/mode'

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
  revalidatePath('/pipeline')
  return { ok: true as const }
}
