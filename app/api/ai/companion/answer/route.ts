import { NextResponse } from 'next/server'
import { z } from 'zod'
import { postingVocabularyOf, verifyDistortions } from '@/lib/ai/distortions'
import { AiError } from '@/lib/ai/errors'
import { composeScreeningAnswer } from '@/lib/ai/stages/compose-companion'
import { selectEvidenceForComposition } from '@/lib/ai/stages/compose-cv'
import { db } from '@/lib/db/client'
import { listAnswers, upsertAnswer } from '@/lib/db/queries/answers'
import { getApplication, mergeDocuments } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { type ScreeningSet, ScreeningSetSchema } from '@/lib/schemas'
import { runCompanionChecks } from '@/lib/verify/companion'

const Body = z.object({
  applicationId: z.string().min(1),
  question: z.string().trim().min(1).max(500),
  /** Present when regenerating one existing row; absent for a brand-new custom question. */
  answerId: z.string().optional(),
})

/**
 * Answers exactly one screening question — a user-typed custom question, or
 * a redo of a single existing answer — through the same grounding pipeline
 * composeAndVerifyCompanion runs for a whole batch: compose, deterministic
 * checks, the distortion check, bank on pass. Kept as its own route rather
 * than a mode on /api/ai/companion so a single-answer request never risks
 * regenerating (and silently discarding edits to) the rest of the set.
 */
export async function POST(request: Request) {
  if (isDemo()) return NextResponse.json(demoBlock(), { status: 403 })

  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'applicationId and question are required', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const application = getApplication(db, body.data.applicationId)
  const profile = getProfile(db)
  if (!application || !profile) {
    return NextResponse.json({ error: 'Not found', code: 'role-not-found' }, { status: 404 })
  }

  // Same rule as the batch route: the bank feeds generation in the
  // document's language only — an answer is written in a language, not
  // translated across one.
  const bank = listAnswers(db)
    .filter((a) => a.language === application.documentLanguage)
    .map((a) => ({ question: a.question, answer: a.answer }))

  try {
    const evidence = listEvidence(db)
    const composed = await composeScreeningAnswer({
      profile,
      requirements: application.requirements,
      mappings: application.mappings,
      evidence,
      language: application.documentLanguage,
      company: application.company,
      jobTitle: application.jobTitle,
      question: body.data.question,
      bank,
    })

    const selectedIds = new Set(
      selectEvidenceForComposition(application.mappings, evidence).map((e) => e.id),
    )
    const postingVocabulary = postingVocabularyOf(application.requirements)
    const report = runCompanionChecks({
      paragraphs: [
        { id: composed.id, text: composed.answer, citedEvidenceIds: composed.citedEvidenceIds },
      ],
      evidence,
      profile,
      selectedEvidenceIds: selectedIds,
      postingVocabulary,
    })

    // The same narrow model question the batch route asks — does this
    // answer overstate its sources?
    report.distortions = await verifyDistortions(
      [{ id: composed.id, text: composed.answer, citedEvidenceIds: composed.citedEvidenceIds }],
      evidence,
    )
    report.passed = report.passed && report.distortions.length === 0

    const documents = application.documents as { screening?: { document?: unknown } } | null
    const existing = ScreeningSetSchema.safeParse(documents?.screening?.document)
    const answerId = body.data.answerId ?? `q_${crypto.randomUUID().slice(0, 8)}`
    const nextAnswer = { ...composed, id: answerId }
    const nextSet: ScreeningSet = existing.success
      ? {
          answers: existing.data.answers.some((a) => a.id === answerId)
            ? existing.data.answers.map((a) => (a.id === answerId ? nextAnswer : a))
            : [...existing.data.answers, nextAnswer],
        }
      : { answers: [nextAnswer] }

    mergeDocuments(db, application.id, { screening: { document: nextSet, report } })

    // Same rule as the batch route: only a grounded answer joins the bank.
    if (report.passed) {
      upsertAnswer(db, {
        question: nextAnswer.question,
        answer: nextAnswer.answer,
        language: application.documentLanguage,
      })
    }

    return NextResponse.json({ answer: nextAnswer, report })
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.userMessage, code: error.kind }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Unexpected error composing the answer.', code: 'unexpected' },
      { status: 500 },
    )
  }
}
