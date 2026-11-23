import { NextResponse } from 'next/server'
import { z } from 'zod'
import { kitWorking } from '#satellite'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { eventStream } from '@/lib/http/event-stream'
import { getLocale } from '@/lib/i18n/server'
import { generateCv } from '@/lib/kit/generate'
import { documentMessage } from '@/lib/push/messages'
import { notify } from '@/lib/push/notify'
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
  // A page opened before a chase still shows Generar; the kit is already
  // paying for this CV.
  if (application && !isDemo() && kitWorking(db, application.id)) {
    return NextResponse.json(
      { error: 'The kit for this application is being written.', code: 'kit-busy' },
      { status: 409 },
    )
  }

  const profile = getProfile(db)
  if (!application || !profile) {
    return NextResponse.json({ error: 'Not found', code: 'role-not-found' }, { status: 404 })
  }

  // Streams the real stages, like triage: writing a CV takes ~50 seconds,
  // and one unchanging "composing…" line for that long reads as a hang.
  return eventStream(
    async (send) => {
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

      // Written and saved by the same code the background kit uses.
      const { cv, report } = await generateCv(db, application.id, {
        // Reasons for any flag are read on this screen, in its language.
        reasonLanguage: await getLocale(),
        onProgress: (stage) => send({ stage }),
      })
      send({ done: true, cv, report })
      {
        const message = documentMessage(await getLocale(), {
          kind: 'cv',
          jobTitle: application.jobTitle,
          company: application.company,
          applicationId: application.id,
        })
        void notify(db, message).catch(() => {})
      }
    },
    { fallback: 'Unexpected error composing the CV.' },
  )
}
