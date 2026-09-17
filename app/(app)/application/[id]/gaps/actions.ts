'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { type Snapshot, takeSnapshot } from '@/lib/gaps/delta'
import { type EvidenceItem, EvidenceItemSchema } from '@/lib/schemas'

type Result = { ok: true; before: Snapshot } | { ok: false; error: string; code: string }

/**
 * Writes what the user confirmed on the review screen.
 *
 * Adds only — gap-fill never replaces or deletes an existing record, unlike an
 * interview, which consumes the stubs it expands. And it saves regardless of
 * what the re-score afterwards says: the framing is "complete your record",
 * not "improve your score", so a verdict that does not move must not cost the
 * user the true thing they just wrote down.
 *
 * The snapshot is read BEFORE the write, because the remap that follows
 * overwrites the stored mappings and coverage. It is returned rather than
 * persisted: it describes one moment, not a fact about the application.
 */
export async function acceptGapEvidenceAction(input: {
  applicationId: string
  evidence: EvidenceItem[]
}): Promise<Result> {
  if (isDemo()) return demoBlock()

  const application = getApplication(db, input.applicationId)
  if (!application) {
    return { ok: false, error: 'That application no longer exists.', code: 'not-found' }
  }

  // Origin is ours: whatever the client sends, evidence written against a
  // demanded requirement is recorded as such.
  const stamped = input.evidence.map((item) => ({ ...item, origin: 'gap-fill' as const }))
  const parsed = EvidenceItemSchema.array().safeParse(stamped)
  if (!parsed.success) {
    // Returned, not thrown: a throw would replace the review screen and
    // discard a paid drafting call's output.
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'The reviewed evidence did not validate.',
      code: 'invalid-request',
    }
  }

  const before = takeSnapshot(application)

  // Appended, not inserted at the top: upsertEvidence defaults an absent
  // sortOrder to 0, which would teleport every new record above the history
  // the user has already curated.
  const base = listEvidence(db).length

  db.transaction((tx) => {
    parsed.data.forEach((item, index) => {
      upsertEvidence(tx, item, base + index)
    })
  })

  revalidatePath('/evidence')
  revalidatePath(`/application/${input.applicationId}`)
  return { ok: true, before }
}
