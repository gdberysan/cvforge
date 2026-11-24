import { NextResponse } from 'next/server'
import { z } from 'zod'
import { spendRoute } from '@/lib/ai/spend-route'
import { db } from '@/lib/db/client'
import { getVariant } from '@/lib/db/queries/cv-variants'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { eventStream } from '@/lib/http/event-stream'
import { makeTranslate } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n/server'
import { notify } from '@/lib/push/notify'
import { TranslateError, translateAndSave } from '@/lib/variant-translation'

const Body = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1).optional() })

/**
 * Translates a composed base CV into its other language — same bullets, same
 * citations — and saves it over the other side the person picked (`targetId`)
 * or as a new row, streaming
 * the real stages like compose. Nothing is saved when the translation does
 * not match the source's structure.
 */
async function handle(request: Request): Promise<Response> {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request', code: 'invalid-request' }, { status: 400 })
  }
  if (isDemo()) {
    return NextResponse.json(
      { error: 'Demo is read-only.', code: 'demo-read-only' },
      { status: 409 },
    )
  }
  const profile = getProfile(db)
  if (!profile) {
    return NextResponse.json({ error: 'No profile yet.', code: 'no-profile' }, { status: 404 })
  }
  const source = getVariant(db, body.data.sourceId)
  if (!source?.cv) {
    return NextResponse.json({ error: 'Not found', code: 'variant-not-found' }, { status: 404 })
  }

  return eventStream(
    async (send) => {
      const id = await translateAndSave(db, {
        sourceId: source.id,
        targetId: body.data.targetId,
        profile,
        evidence: listEvidence(db),
        reasonLanguage: await getLocale(),
        onProgress: (stage) => send({ stage }),
        // The source was cut too, to keep the pair one CV: the person is told.
        onTrimmedSource: (cuts) => send({ trimmedSource: cuts }),
      })
      send({ done: true, id })
      const t = makeTranslate(await getLocale())
      void notify(db, {
        kind: 'document-ready',
        title: t('push.cvReady'),
        body: source.name,
        url: '/cvs',
      }).catch(() => {})
    },
    {
      fallback: 'Unexpected error translating the CV.',
      describe: (error) =>
        error instanceof TranslateError ? { error: error.message, code: error.code } : undefined,
    },
  )
}

/** One paid action: its calls are recorded under it (lib/ai/spend-route.ts). */
export const POST = spendRoute('translate', handle)
