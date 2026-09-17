'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteEvidence, listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { saveInterviewSession } from '@/lib/db/queries/interview-sessions'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { type EvidenceItem, EvidenceItemSchema } from '@/lib/schemas'

type Result = { ok: true } | { ok: false; error: string; code: string }

/**
 * Replaces the role's stubs with the interviewed evidence, and records the
 * verbatim Q&A as its own session — not to derive more evidence from later,
 * just so "what was I asked, and what did I say" stays legible against this
 * role after the answers have been condensed into CV-facing text.
 *
 * The stubs were scaffolding. Keeping them alongside the expanded versions
 * would duplicate every achievement in the CV composer's input, and the
 * composer would have to guess which one to believe.
 */
export async function acceptInterviewAction(input: {
  roleId: string
  replaceStubIds: string[]
  evidence: EvidenceItem[]
  answers: { question: string; answer: string }[]
}): Promise<Result> {
  if (isDemo()) return demoBlock()
  const parsed = EvidenceItemSchema.array().safeParse(input.evidence)
  if (!parsed.success) {
    // Returned, not thrown: a throw would replace the review screen and
    // discard a full interview's structured output.
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'The reviewed evidence did not validate.',
      code: 'invalid-request',
    }
  }
  const items = parsed.data
  // Only import-origin scaffolding may be replaced. Whatever ids the client
  // sends, interviewed and hand-entered records are never deleted here.
  const stubIds = new Set(
    listEvidence(db)
      .filter((e) => e.origin === 'import')
      .map((e) => e.id),
  )
  // One transaction: a crash mid-loop must not leave stubs half-deleted and
  // the new records half-written.
  db.transaction((tx) => {
    for (const stubId of input.replaceStubIds) {
      if (stubIds.has(stubId)) deleteEvidence(tx, stubId)
    }
    items.forEach((item, index) => {
      upsertEvidence(tx, item, index)
    })
    saveInterviewSession(tx, input.roleId, input.answers)
  })
  revalidatePath('/evidence')
  return { ok: true as const }
}
