import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiError } from '@/lib/ai/errors'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { getLocale } from '@/lib/i18n/server'
import { generateCompanion } from '@/lib/kit/generate'
import { kitWorking } from '@/lib/kit/queue'
import { documentMessage } from '@/lib/push/messages'
import { notify } from '@/lib/push/notify'

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
  // A page opened before a chase still shows Generar; the kit is already
  // paying for this letter. Screening answers and messages are not in it.
  if (
    application &&
    body.data.kind === 'coverLetter' &&
    !isDemo() &&
    kitWorking(db, application.id)
  ) {
    return NextResponse.json(
      { error: 'The kit for this application is being written.', code: 'kit-busy' },
      { status: 409 },
    )
  }

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

  try {
    // Written and saved — bank upsert included — by the same code the
    // background kit uses.
    const { document, report } = await generateCompanion(db, application.id, body.data.kind, {
      // Reasons for any flag are read on this screen, in its language.
      reasonLanguage: await getLocale(),
      recruiterName: body.data.recruiterName,
    })

    // Always notify: the phone's service worker stays silent when the app
    // is already in front (public/sw.js), so a watched run makes no noise.
    {
      const message = documentMessage(await getLocale(), {
        kind: 'companion',
        jobTitle: application.jobTitle,
        company: application.company,
        applicationId: application.id,
      })
      void notify(db, message).catch(() => {})
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
