import { z } from 'zod'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { currentSpendContext } from '@/lib/ai/spend-context'
import { spendRoute } from '@/lib/ai/spend-route'
import { runRemap, runTriage } from '@/lib/ai/triage'
import { db } from '@/lib/db/client'
import {
  createApplication,
  findByPostingHash,
  updateAnalysis,
  updateIntake,
} from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { attachRunToApplication } from '@/lib/db/queries/spend'
import { isDemo } from '@/lib/demo/mode'
import { demoTriageEvents } from '@/lib/demo/triage-events'
import { hashEvidenceProjection, hashPosting } from '@/lib/hash'
import { eventStream } from '@/lib/http/event-stream'
import { getLocale } from '@/lib/i18n/server'
import { verdictMessage } from '@/lib/push/messages'
import { notify } from '@/lib/push/notify'
import { MarketSchema, SourceSchema } from '@/lib/schemas'

const MAX_POSTING = 50_000

const Body = z.object({
  text: z.string().min(80).max(MAX_POSTING),
  // Optional, not defaulted: a re-analysis sends only the text and market,
  // and a default here used to overwrite a stored LinkedIn source with
  // "other" on every re-score.
  source: SourceSchema.optional(),
  sourceUrl: z.string().url().optional(),
  market: MarketSchema.default('us-remote'),
})

/**
 * Streams progress as Server-Sent Events. Triage takes 20-40 seconds across
 * two model calls, and a single unchanging status line for that long reads as
 * a hang. The stages emitted here are the real ones — each is a call in
 * runTriage, not a decorative timeline.
 */
async function handle(request: Request): Promise<Response> {
  const payload: unknown = await request.json().catch(() => undefined)
  const body = Body.safeParse(payload)
  if (!body.success) {
    const text = (payload as { text?: unknown })?.text
    const tooLong = typeof text === 'string' && text.length > MAX_POSTING
    const badUrl = body.error.issues.some((i) => i.path[0] === 'sourceUrl')
    return json(
      tooLong
        ? {
            error: `That posting is over ${MAX_POSTING.toLocaleString('en-US')} characters. Trim it to the relevant sections and paste again.`,
            code: 'posting-too-long',
          }
        : badUrl
          ? {
              error: 'That link is not a valid URL. Fix it or clear the field, then retry.',
              code: 'invalid-url',
            }
          : { error: 'Paste at least 80 characters of the posting.', code: 'posting-too-short' },
      400,
    )
  }

  const profile = getProfile(db)
  if (!profile) {
    return json({ error: 'Build your evidence base first.', code: 'no-profile' }, 409)
  }

  const evidence = listEvidence(db)
  const evidenceHash = hashEvidenceProjection(buildEvidenceProjection(profile, evidence))

  // A posting already triaged against the CURRENT evidence base costs nothing.
  // If the evidence changed since, the requirements still stand (the posting
  // has not changed) but the verdict is stale — stage ② re-runs below.
  // Explanations are read on this screen, in the language it is set to.
  const rationaleLanguage = await getLocale()
  const hash = hashPosting(body.data.text)
  const existing = findByPostingHash(db, hash)

  // Demo: the posting must be one of the seeded ones; its analysis is played
  // back stage by stage and resolves to the seeded application. Nothing is
  // written (product spec §5.4).
  if (isDemo()) {
    if (!existing) {
      return json(
        { error: 'The demo can only analyse the sample postings.', code: 'demo-miss' },
        409,
      )
    }
    const script = demoTriageEvents(existing)
    return eventStream(
      async (send) => {
        for (const step of script) {
          send(step.event)
          if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs))
        }
      },
      { fallback: 'Unexpected error during triage.' },
    )
  }

  // Both cached paths reuse the stored analysis, but the intake fields
  // (market, source, url) follow THIS request — a re-paste with a different
  // market selected used to be silently ignored, and compose then applied
  // the wrong market's rules. Fields the request left out keep their stored
  // value. An archived row is the record of a decision already made (a
  // skip, from here or from the job agent): a re-paste reads it, it does not
  // rewrite where it came from.
  if (existing && !existing.archived) {
    updateIntake(db, existing.id, {
      market: body.data.market,
      source: body.data.source,
      sourceUrl: body.data.sourceUrl,
    })
  }

  if (existing && existing.evidenceHash === evidenceHash) {
    return json({
      applicationId: existing.id,
      cached: true,
      company: existing.company,
      jobTitle: existing.jobTitle,
      coverage: existing.coverage,
      requirements: existing.requirements,
      mappings: existing.mappings,
    })
  }

  return eventStream(
    async (send) => {
      if (existing) {
        const { mappings, coverage } = await runRemap({
          requirements: existing.requirements,
          profile,
          evidence,
          onProgress: (stage, detail) => send({ stage, detail }),
          rationaleLanguage,
        })

        send({ stage: 'saving' })
        updateAnalysis(db, existing.id, { mappings, coverage, evidenceHash })

        send({
          done: true,
          applicationId: existing.id,
          cached: false,
          company: existing.company,
          jobTitle: existing.jobTitle,
          requirements: existing.requirements,
          mappings,
          coverage,
        })
        // Always: Android keeps a backgrounded tab's connection open, so
        // 'still connected' does not mean 'still looking'. The phone's service
        // worker stays silent when the app is already in front (public/sw.js).
        {
          const message = verdictMessage(rationaleLanguage, {
            verdict: coverage.verdict,
            jobTitle: existing.jobTitle,
            company: existing.company,
            applicationId: existing.id,
          })
          void notify(db, message).catch(() => {})
        }
        return
      }

      const result = await runTriage({
        postingText: body.data.text,
        profile,
        evidence,
        onProgress: (stage, detail) => send({ stage, detail }),
        rationaleLanguage,
      })

      send({ stage: 'saving' })
      const applicationId = createApplication(db, {
        source: body.data.source ?? 'other',
        sourceUrl: body.data.sourceUrl,
        company: result.company,
        jobTitle: result.jobTitle,
        market: body.data.market,
        documentLanguage: result.language,
        postingRaw: body.data.text,
        postingHash: hash,
        evidenceHash,
        requirements: result.requirements,
        mappings: result.mappings,
        coverage: result.coverage,
      })

      // This run's calls were made before the application existed.
      attachRunToApplication(db, currentSpendContext()?.runId, applicationId)
      send({ done: true, applicationId, cached: false, ...result })
      {
        const message = verdictMessage(rationaleLanguage, {
          verdict: result.coverage.verdict,
          jobTitle: result.jobTitle,
          company: result.company,
          applicationId,
        })
        void notify(db, message).catch(() => {})
      }
    },
    { fallback: 'Unexpected error during triage.' },
  )
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** One paid action: its calls are recorded under it (lib/ai/spend-route.ts). */
export const POST = spendRoute('analysis', handle)
