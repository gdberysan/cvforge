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
import { getLocale } from '@/lib/i18n/server'
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

  // Streams the real stages, like triage: writing a CV takes ~50 seconds,
  // and one unchanging "composing…" line for that long reads as a hang.
  // Closing the tab must not discard the paid calls — results are saved
  // regardless, and `send` just goes quiet once the client is gone.
  const encoder = new TextEncoder()
  let open = true
  const stream = new ReadableStream({
    cancel() {
      open = false
    },
    async start(controller) {
      const send = (event: unknown) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          open = false
        }
      }
      try {
        // Demo: the kit was generated once when the seed was built; its
        // stages are played back, never claimed as a live run's timing.
        if (isDemo()) {
          const docs = application.documents as { cv?: unknown } | null
          const parsed = CVContentSchema.safeParse(docs?.cv)
          const report = GroundingReportSchema.safeParse(application.groundingReport)
          if (!parsed.success || !report.success) {
            send({ error: 'Not generated in the demo.', code: 'demo-miss' })
            return
          }
          for (const stage of ['writing', 'checking', 'verifying']) {
            send({ stage })
            await new Promise((r) => setTimeout(r, 500))
          }
          send({ done: true, cv: parsed.data, report: report.data })
          return
        }

        const { cv, report } = await composeAndVerify({
          // Reasons for any flag are read on this screen, in its language.
          reasonLanguage: await getLocale(),
          profile,
          requirements: application.requirements,
          mappings: application.mappings,
          evidence: listEvidence(db),
          language: application.documentLanguage,
          market: application.market,
          company: application.company,
          jobTitle: application.jobTitle,
          postingVocabulary: postingVocabularyOf(application.requirements),
          onProgress: (stage) => send({ stage }),
        })
        saveDocuments(db, application.id, { cv }, report)
        send({ done: true, cv, report })
      } catch (error) {
        send(
          error instanceof AiError
            ? { error: error.userMessage, code: error.kind }
            : { error: 'Unexpected error composing the CV.', code: 'unexpected' },
        )
      } finally {
        if (open) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
