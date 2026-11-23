import type { Db } from '@/lib/db/client'
import { createApplication, findByPostingHash } from '@/lib/db/queries/applications'
import { dismissJob } from '@/lib/db/queries/discover'
import type {
  Coverage,
  DocumentLanguage,
  EvidenceMapping,
  Market,
  Requirement,
  Source,
} from '@/lib/schemas'

/**
 * Everything the job agent stored about a find when it judged it, so a
 * chase minutes or days later creates the application without paying for
 * triage again. Same shape as the satellite's `ShownPostingAnalysis`
 * (cvforge-satellite src/db/shown-postings.ts), which writes it.
 */
export type FindAnalysis = {
  source: Source
  sourceUrl: string
  company: string
  jobTitle: string
  market: Market
  documentLanguage: DocumentLanguage
  postingRaw: string
  postingHash: string
  evidenceHash: string
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  coverage: Coverage
}

export type ChaseResult =
  | { kind: 'created' | 'existing'; applicationId: string }
  | { kind: 'repost'; existingId: string }

/**
 * LinkedIn appends tracking query strings to the same posting. Scheme and
 * host case are not part of the key; the path's case is kept. Mirrors the
 * satellite's `canonicalUrl` (src/discover.ts), which keys its own dedupe.
 */
export function canonicalJobUrl(url: string): string {
  try {
    const u = new URL(url)
    return `//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url.split('?')[0]?.replace(/\/$/, '') ?? url
  }
}

/**
 * One chase, whichever button asked: the find card on Hoy or Perseguir in
 * Telegram. The caller owns the satellite's pending row; this owns CVForge.
 *
 * - A posting already in CVForge under the same URL is the same posting
 *   chased twice — a double tap, or Telegram and the app both. The existing
 *   application is returned and nothing is created.
 * - The same text under a DIFFERENT URL is a LinkedIn repost: a new job id
 *   carrying a verbatim description. A second application would be a
 *   duplicate; dismissing the new id is what keeps it from resurfacing.
 * - A database error throws, so the caller keeps its row and can retry.
 *
 * The check and the insert are one write transaction, taken up front:
 * Telegram's button runs in the satellite's process and the card in the
 * server's, so a tap in each at the same instant would otherwise both see
 * "not yet in CVForge" and create two applications.
 */
export function chaseFind(
  db: Db,
  postingId: string,
  find: FindAnalysis,
  /** Injectable so the satellite's handler tests prove the calls without a
   * live database; production passes nothing. */
  deps: {
    create?: typeof createApplication
    findByHash?: typeof findByPostingHash
    dismiss?: typeof dismissJob
  } = {},
): ChaseResult {
  const { create = createApplication, findByHash = findByPostingHash, dismiss = dismissJob } = deps
  return db.transaction(
    (tx): ChaseResult => {
      const existing = findByHash(tx, find.postingHash)
      if (existing) {
        if (canonicalJobUrl(existing.sourceUrl ?? '') === canonicalJobUrl(find.sourceUrl)) {
          return { kind: 'existing', applicationId: existing.id }
        }
        dismiss(tx, postingId)
        return { kind: 'repost', existingId: existing.id }
      }
      return {
        kind: 'created',
        applicationId: create(tx, {
          source: find.source,
          sourceUrl: find.sourceUrl,
          company: find.company,
          jobTitle: find.jobTitle,
          market: find.market,
          documentLanguage: find.documentLanguage,
          postingRaw: find.postingRaw,
          postingHash: find.postingHash,
          evidenceHash: find.evidenceHash,
          requirements: find.requirements,
          mappings: find.mappings,
          coverage: find.coverage,
        }),
      }
    },
    { behavior: 'immediate' },
  )
}
