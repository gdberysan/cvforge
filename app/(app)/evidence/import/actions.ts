'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteEvidence, listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { reconcileImport } from '@/lib/import/reconcile'
import { type ParsedCV, ParsedCVSchema } from '@/lib/schemas'

type Result = { ok: true } | { ok: false; error: string; code: string }

/**
 * Only ever called after the user has reviewed the skeleton. Never silent —
 * and never a thrown error either: a validation failure returns a message the
 * review screen can show, instead of replacing it and discarding the parse.
 */
export async function acceptImportAction(input: ParsedCV): Promise<Result> {
  if (isDemo()) return demoBlock()
  const parsed = ParsedCVSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`
        : 'The reviewed skeleton did not validate.',
      code: 'invalid-request',
    }
  }
  // Kept interviewed/manual records point at the OLD role ids, and the parser
  // numbers roles by position — matched roles must keep their existing ids or
  // the kept evidence silently reattaches to whatever now sits at that spot.
  const current = getProfile(db)
  const data = current ? reconcileImport(current.experience, parsed.data) : parsed.data

  // A new import supersedes the previous import's scaffolding — leaving the
  // old stubs would attach them to roles that no longer exist and feed the
  // mapper the same achievement twice. Interviewed and hand-entered records
  // are real evidence and are never touched here.
  // One transaction: replacing the old scaffolding, saving the profile, and
  // writing the new records either all land or none do.
  db.transaction((tx) => {
    for (const item of listEvidence(tx)) {
      if (item.origin === 'import') deleteEvidence(tx, item.id)
    }
    saveProfile(tx, { ...data.profile, updatedAt: new Date().toISOString() })
    data.evidence.forEach((item, index) => {
      upsertEvidence(tx, item, index)
    })
  })
  revalidatePath('/evidence')
  return { ok: true }
}
