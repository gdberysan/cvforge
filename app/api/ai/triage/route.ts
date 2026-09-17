import { z } from 'zod'
import { AiError } from '@/lib/ai/errors'
import { buildEvidenceProjection } from '@/lib/ai/projection'
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
import { isDemo } from '@/lib/demo/mode'
import { demoTriageEvents } from '@/lib/demo/triage-events'
import { hashEvidenceProjection, hashPosting } from '@/lib/hash'
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

const encoder = new TextEncoder()

/**
 * Streams progress as Server-Sent Events. Triage takes 20-40 seconds across
 * two model calls, and a single unchanging status line for that long reads as
 * a hang. The stages emitted here are the real ones — each is a call in
 * runTriage, not a decorative timeline.
 */
export async function POST(request: Request) {
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
    const replay = new ReadableStream({
      async start(controller) {
        for (const step of script) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(step.event)}\n\n`))
          if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs))
        }
        controller.close()
      },
    })
    return new Response(replay, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    })
  }

  // Both cached paths reuse the stored analysis, but the intake fields
  // (market, source, url) follow THIS request — a re-paste with a different
  // market selected used to be silently ignored, and compose then applied
  // the wrong market's rules. Fields the request left out keep their stored
  // value.
  if (existing) {
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

  // Closing the tab mid-run must not discard the paid model calls: `send`
  // goes quiet once the client is gone, and results are persisted regardless.
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
        if (existing) {
          const { mappings, coverage } = await runRemap({
            requirements: existing.requirements,
            profile,
            evidence,
            onProgress: (stage, detail) => send({ stage, detail }),
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
          return
        }

        const result = await runTriage({
          postingText: body.data.text,
          profile,
          evidence,
          onProgress: (stage, detail) => send({ stage, detail }),
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

        send({ done: true, applicationId, cached: false, ...result })
      } catch (error) {
        // Errors travel as events: the response already committed a 200 with
        // the stream, so a status code is no longer available to carry them.
        send(
          error instanceof AiError
            ? { error: error.userMessage, code: error.kind }
            : { error: 'Unexpected error during triage.', code: 'unexpected' },
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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
