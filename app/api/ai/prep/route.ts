import { NextResponse } from 'next/server'
import { z } from 'zod'
import { kitWorking } from '#satellite'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { spendRoute } from '@/lib/ai/spend-route'
import { db } from '@/lib/db/client'
import { savePrep } from '@/lib/db/queries/prep'
import { isDemo } from '@/lib/demo/mode'
import { hashEvidenceProjection } from '@/lib/hash'
import { eventStream } from '@/lib/http/event-stream'
import { buildPrepContext } from '@/lib/prep/context'
import { loadPrepInput } from '@/lib/prep/load'
import { runPrep } from '@/lib/prep/pipeline'
import { DocumentLanguageSchema } from '@/lib/schemas'

/**
 * Applications with a prep being written right now. The run outlives its
 * request (the stream keeps working after the page goes away), so a reload
 * and a second tap started a second paid run alongside the first: two full
 * preps, 14 s apart, on 2026-10-18. On globalThis like the SDK client, so a
 * second copy of this module cannot hold a lock of its own.
 */
const globalForPrep = globalThis as unknown as { __cvforgePrepRunning?: Set<string> }
globalForPrep.__cvforgePrepRunning ??= new Set<string>()
const running = globalForPrep.__cvforgePrepRunning

const Body = z.object({
  applicationId: z.string().min(1),
  language: DocumentLanguageSchema.optional(),
  eventId: z.string().min(1).optional(),
})

/**
 * Writes an interview prep (spec 2026-10-18 Part B). Paid, and only ever on
 * his tap: one generation, the checker, and at most one refine — every call
 * recorded by callStructured. Streams its stages because it takes a minute.
 */
async function handle(request: Request): Promise<Response> {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'applicationId is required', code: 'invalid-request' },
      { status: 400 },
    )
  }
  if (isDemo()) {
    return NextResponse.json(
      { error: 'Not generated in the demo.', code: 'demo-miss' },
      { status: 409 },
    )
  }
  const { applicationId, language, eventId } = body.data
  const input = loadPrepInput(db, applicationId, language, eventId)
  if (!input) {
    return NextResponse.json({ error: 'Not found', code: 'role-not-found' }, { status: 404 })
  }
  if (kitWorking(db, applicationId)) {
    return NextResponse.json(
      { error: 'The kit for this application is being written.', code: 'kit-busy' },
      { status: 409 },
    )
  }

  if (running.has(applicationId)) {
    return NextResponse.json(
      { error: 'A prep for this application is being written.', code: 'prep-busy' },
      { status: 409 },
    )
  }
  running.add(applicationId)

  return eventStream(
    async (send) => {
      try {
        const ctx = buildPrepContext(input)
        const { content, report } = await runPrep(ctx, (stage) => send({ stage }))
        const prepId = savePrep(db, {
          applicationId,
          outcomeEventId: ctx.round?.eventId ?? null,
          language: ctx.language,
          content,
          report,
          evidenceHash: hashEvidenceProjection(
            buildEvidenceProjection(input.profile, input.evidence),
          ),
        })
        send({ done: true, prepId, content, report })
      } finally {
        running.delete(applicationId)
      }
    },
    { fallback: 'Unexpected error writing the interview prep.' },
  )
}

/** One paid action: its calls are recorded under it (lib/ai/spend-route.ts). */
export const POST = spendRoute('prep', handle)
