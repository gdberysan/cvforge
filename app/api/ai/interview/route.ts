import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiError } from '@/lib/ai/errors'
import { planInterview, structureAnswers } from '@/lib/ai/stages/interview'
import { db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { SeedSchema } from '@/lib/demo/seed'
import { getLocale } from '@/lib/i18n/server'
import { splitEvidenceForInterview } from '@/lib/interview/split'
import { InterviewAnswerSchema } from '@/lib/schemas'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('plan'), roleId: z.string().min(1) }),
  z.object({
    action: z.literal('structure'),
    roleId: z.string().min(1),
    answers: z.array(InterviewAnswerSchema).min(1),
  }),
])

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'Invalid request.', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const profile = getProfile(db)
  const role = profile?.experience.find((r) => r.id === body.data.roleId)
  if (!profile || !role) {
    return NextResponse.json({ error: 'Role not found.', code: 'role-not-found' }, { status: 404 })
  }

  const { stubs, existing } = splitEvidenceForInterview(listEvidence(db), role.id)

  // Demo: questions were planned once when the seed was built; answering is
  // a write and is refused.
  if (isDemo()) {
    if (body.data.action === 'plan') {
      const seed = SeedSchema.parse(
        JSON.parse(readFileSync(path.join(process.cwd(), 'demo', 'seed.json'), 'utf8')),
      )
      const questions = seed.interviewPlans[role.id] ?? []
      await new Promise((r) => setTimeout(r, 1200))
      return NextResponse.json({ questions })
    }
    return NextResponse.json(
      { error: 'Demo is read-only.', code: 'demo-read-only' },
      { status: 409 },
    )
  }

  try {
    if (body.data.action === 'plan') {
      const locale = await getLocale()
      return NextResponse.json({
        questions: await planInterview({ role, stubs, existing, locale }),
      })
    }
    const { evidence, dropped } = await structureAnswers({
      role,
      stubs,
      // The same records the planner is told not to re-ask about. Without
      // them here, an answer that mentions work already on file is recorded a
      // second time, and the CV composer is left guessing which copy to trust.
      existing,
      answers: body.data.answers,
    })
    return NextResponse.json({ evidence, dropped })
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.userMessage, code: error.kind }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Unexpected error during the interview.', code: 'unexpected' },
      { status: 500 },
    )
  }
}
