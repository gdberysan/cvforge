'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { upsertAnswer } from '@/lib/db/queries/answers'
import { deleteApplication, getApplication, mergeDocuments } from '@/lib/db/queries/applications'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { type ScreeningSet, ScreeningSetSchema } from '@/lib/schemas'

type Result = { ok: true } | { ok: false; error: string; code: string }

/**
 * Refining an answer updates both homes: this application's document and the
 * bank, so the refined wording is what future postings reuse.
 */
export async function saveScreeningAnswerAction(input: {
  applicationId: string
  answerId: string
  answer: string
}): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (!input.answer.trim()) {
    return { ok: false, error: 'An answer cannot be empty.', code: 'invalid-request' }
  }

  const application = getApplication(db, input.applicationId)
  if (!application) {
    return { ok: false, error: 'Not found.', code: 'role-not-found' }
  }

  const documents = application.documents as { screening?: { document?: unknown } } | null
  const parsed = ScreeningSetSchema.safeParse(documents?.screening?.document)
  if (!parsed.success) {
    return { ok: false, error: 'No screening answers to update.', code: 'invalid-request' }
  }

  const target = parsed.data.answers.find((a) => a.id === input.answerId)
  if (!target) {
    return { ok: false, error: 'That answer no longer exists.', code: 'role-not-found' }
  }

  const updated: ScreeningSet = {
    answers: parsed.data.answers.map((a) =>
      a.id === input.answerId ? { ...a, answer: input.answer } : a,
    ),
  }

  const screening = documents?.screening as Record<string, unknown>
  mergeDocuments(db, application.id, { screening: { ...screening, document: updated } })
  upsertAnswer(db, {
    question: target.question,
    answer: input.answer,
    language: application.documentLanguage,
  })
  revalidatePath(`/application/${application.id}`)
  return { ok: true }
}

/** Gone means gone: the row, its requirements, mappings, outcomes and
 *  documents all cascade. The UI arms this behind a second click. */
export async function deleteApplicationAction(applicationId: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (!getApplication(db, applicationId)) {
    return { ok: false, error: 'Not found.', code: 'role-not-found' }
  }
  deleteApplication(db, applicationId)
  revalidatePath('/pipeline')
  revalidatePath('/')
  return { ok: true }
}
