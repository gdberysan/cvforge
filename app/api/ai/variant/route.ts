import { NextResponse } from 'next/server'
import { z } from 'zod'
import { spendRoute } from '@/lib/ai/spend-route'
import { db } from '@/lib/db/client'
import { getVariant, saveVariantCv, upsertVariantBrief } from '@/lib/db/queries/cv-variants'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { eventStream } from '@/lib/http/event-stream'
import { makeTranslate } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n/server'
import { notify } from '@/lib/push/notify'
import { DocumentLanguageSchema, MarketSchema } from '@/lib/schemas'
import { composeVariant } from '@/lib/variants'

const Body = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  focus: z.string().trim().min(1).max(1500),
  language: DocumentLanguageSchema,
  market: MarketSchema,
})

/** Creates (no id) or recomposes (id) a base CV, streaming the real stages like compose. */
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
  if (body.data.id && !getVariant(db, body.data.id)) {
    return NextResponse.json({ error: 'Not found', code: 'variant-not-found' }, { status: 404 })
  }

  const { id: existing, ...brief } = body.data
  // A new base CV gets its row now, so a failed first compose still leaves
  // something to edit. An edit is written only with the CV it produced: a
  // failed recompose must not show the new focus above the old CV.
  const id = existing ?? upsertVariantBrief(db, brief)

  return eventStream(
    async (send) => {
      send({ id })
      const result = await composeVariant({
        brief,
        profile,
        evidence: listEvidence(db),
        reasonLanguage: await getLocale(),
        onProgress: (stage) => send({ stage }),
      })
      // Saved whether or not the tab is still open: the calls were paid for.
      saveVariantCv(db, id, result, existing ? brief : undefined)
      send({ done: true, id })
      {
        const t = makeTranslate(await getLocale())
        const message = {
          kind: 'document-ready' as const,
          title: t('push.cvReady'),
          body: brief.name,
          url: '/cvs',
        }
        void notify(db, message).catch(() => {})
      }
    },
    { fallback: 'Unexpected error composing the CV.' },
  )
}

/** One paid action: its calls are recorded under it (lib/ai/spend-route.ts). */
export const POST = spendRoute('base-cv', handle)
