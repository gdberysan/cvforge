'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deleteAnswer, replaceAnswer } from '@/lib/db/queries/prep'
import { demoBlock, isDemo } from '@/lib/demo/mode'

type Result = { ok: true; id?: string } | { ok: false; error: string; code: string }

const Answer = z.object({
  applicationId: z.string().min(1),
  part: z.enum(['S', 'T', 'A', 'R', 'Q', 'D', 'C', 'P']),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(3000),
  evidenceIds: z.array(z.string().min(1)).max(20),
})

/**
 * His own words for a slot the prep could not fill (a part of a story, a
 * question nothing answers, notes after a round). Kept as his answer: the
 * next prep may stand on it, cited as answer:<id>, under the same checks.
 */
export async function savePrepAnswerAction(input: z.input<typeof Answer>): Promise<Result> {
  if (isDemo()) return demoBlock()
  const a = Answer.safeParse(input)
  if (!a.success) return { ok: false, error: 'Write an answer first.', code: 'invalid-request' }
  const id = replaceAnswer(db, a.data)
  revalidatePath(`/application/${a.data.applicationId}`)
  return { ok: true, id }
}

export async function deletePrepAnswerAction(input: {
  applicationId: string
  id: string
}): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (!deleteAnswer(db, String(input.applicationId), String(input.id))) {
    return { ok: false, error: 'Not found.', code: 'not-found' }
  }
  revalidatePath(`/application/${input.applicationId}`)
  return { ok: true }
}
