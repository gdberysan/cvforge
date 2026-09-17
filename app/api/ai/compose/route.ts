import { NextResponse } from 'next/server'
import { z } from 'zod'
import { composeAndVerify } from '@/lib/ai/compose'
import { postingVocabularyOf } from '@/lib/ai/distortions'
import { AiError } from '@/lib/ai/errors'
import { db } from '@/lib/db/client'
import { getApplication, saveDocuments } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { CVContentSchema, GroundingReportSchema } from '@/lib/schemas'

const Body = z.object({ applicationId: z.string().min(1) })

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'applicationId is required', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const application = getApplication(db, body.data.applicationId)
  const profile = getProfile(db)
  if (!application || !profile) {
    return NextResponse.json({ error: 'Not found', code: 'role-not-found' }, { status: 404 })
  }

  // Demo: the kit was generated once when the seed was built; serve it.
  if (isDemo()) {
    const docs = application.documents as { cv?: unknown } | null
    const parsed = CVContentSchema.safeParse(docs?.cv)
    const report = GroundingReportSchema.safeParse(application.groundingReport)
    if (!parsed.success || !report.success) {
      return NextResponse.json(
        { error: 'Not generated in the demo.', code: 'demo-miss' },
        { status: 409 },
      )
    }
    await new Promise((r) => setTimeout(r, 1500))
    return NextResponse.json({ cv: parsed.data, report: report.data })
  }

  try {
    const { cv, report } = await composeAndVerify({
      profile,
      requirements: application.requirements,
      mappings: application.mappings,
      evidence: listEvidence(db),
      language: application.documentLanguage,
      market: application.market,
      companyTone: '',
      company: application.company,
      jobTitle: application.jobTitle,
      postingVocabulary: postingVocabularyOf(application.requirements),
    })

    saveDocuments(db, application.id, { cv }, report)
    return NextResponse.json({ cv, report })
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.userMessage, code: error.kind }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Unexpected error composing the CV.', code: 'unexpected' },
      { status: 500 },
    )
  }
}
