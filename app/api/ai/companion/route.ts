import { NextResponse } from 'next/server'
import { z } from 'zod'
import { composeAndVerifyCompanion } from '@/lib/ai/companion'
import { AiError } from '@/lib/ai/errors'
import { db } from '@/lib/db/client'
import { listAnswers, upsertAnswer } from '@/lib/db/queries/answers'
import { getApplication, mergeDocuments } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import type { ScreeningSet } from '@/lib/schemas'

const Body = z.object({
  applicationId: z.string().min(1),
  kind: z.enum(['coverLetter', 'screening', 'recruiterMessage']),
  recruiterName: z.string().trim().max(80).optional(),
})

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'applicationId and kind are required', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const application = getApplication(db, body.data.applicationId)
  const profile = getProfile(db)
  if (!application || !profile) {
    return NextResponse.json({ error: 'Not found', code: 'role-not-found' }, { status: 404 })
  }

  // Demo: companions were generated once when the seed was built; serve them.
  if (isDemo()) {
    const docs = application.documents as Record<
      string,
      { document?: unknown; report?: unknown }
    > | null
    const stored = docs?.[body.data.kind]
    if (!stored?.document || !stored.report) {
      return NextResponse.json(
        { error: 'Not generated in the demo.', code: 'demo-miss' },
        { status: 409 },
      )
    }
    await new Promise((r) => setTimeout(r, 1500))
    return NextResponse.json({ document: stored.document, report: stored.report })
  }

  // The bank feeds generation in the document's language only — an answer is
  // written in a language, not translated across one.
  const bank = listAnswers(db)
    .filter((a) => a.language === application.documentLanguage)
    .map((a) => ({ question: a.question, answer: a.answer }))

  try {
    const { document, report } = await composeAndVerifyCompanion(body.data.kind, {
      profile,
      requirements: application.requirements,
      mappings: application.mappings,
      evidence: listEvidence(db),
      language: application.documentLanguage,
      company: application.company,
      jobTitle: application.jobTitle,
      recruiterName: body.data.recruiterName,
      bank,
    })

    mergeDocuments(db, application.id, { [body.data.kind]: { document, report } })

    // Generate once, refine, reuse: fresh screening answers join the bank —
    // but ONLY when grounding passed. The bank is fed back into future
    // composes as "the person's own prior writing"; banking a failed set
    // would launder an unverified figure into a trusted source, and the
    // in-place upsert would overwrite an answer the user already refined.
    if (body.data.kind === 'screening' && report.passed) {
      for (const answer of (document as ScreeningSet).answers) {
        upsertAnswer(db, {
          question: answer.question,
          answer: answer.answer,
          language: application.documentLanguage,
        })
      }
    }

    return NextResponse.json({ document, report })
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.userMessage, code: error.kind }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Unexpected error composing the document.', code: 'unexpected' },
      { status: 500 },
    )
  }
}
