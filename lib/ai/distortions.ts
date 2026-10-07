import type { EvidenceItem, GroundingReport, Requirement } from '@/lib/schemas'
import { checkDistortions } from './stages/verify-distortion'

export type DistortionCandidate = { id: string; text: string; citedEvidenceIds: string[] }

/**
 * The narrow model half of verification, shared by the CV, the companions and
 * the single-answer route so all three ask the same question and fail the
 * same way.
 *
 * Sources carry their periods so tense misrepresentation — "currently" about
 * an ended engagement — is checkable, not a style call.
 *
 * Fails closed: a candidate the batched call returned no verdict for is
 * reported as a distortion, never silently passed. Two of the three callers
 * used to iterate the verdicts instead of the candidates, so an incomplete
 * response on a long screening set let paragraphs ship unverified — and be
 * banked as the person's own prior writing.
 */
export async function verifyDistortions(
  candidates: DistortionCandidate[],
  evidence: EvidenceItem[],
  /**
   * Cited id → a further recorded fact that source stands on. A credential
   * (cited by companions) has no evidence row, so its line is the whole
   * source; a project record adds its project's line, because a project's
   * stack is the person's own statement and "built it in TypeScript" must
   * not be judged unsupported for living there rather than in the record.
   */
  extraSources: Map<string, string> = new Map(),
  reasonLanguage?: 'en' | 'es',
): Promise<GroundingReport['distortions']> {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]))
  const verdicts = await checkDistortions(
    candidates.map((c) => ({
      id: c.id,
      text: c.text,
      sources: c.citedEvidenceIds.flatMap((id) => {
        const item = evidenceById.get(id)
        const extra = extraSources.get(id)
        return [
          item ? sourceLine(item) : '',
          extra === undefined ? '' : item ? `[project] ${extra}` : `[credential] ${extra}`,
        ].filter(Boolean)
      }),
    })),
    reasonLanguage,
  )

  const verdictById = new Map(verdicts.map((v) => [v.bulletId, v]))
  return candidates.flatMap((c) => {
    const v = verdictById.get(c.id)
    if (!v)
      return [{ bulletId: c.id, reason: 'distortion check returned no verdict for this text' }]
    return v.supported ? [] : [{ bulletId: c.id, reason: v.reason }]
  })
}

/**
 * A record as the checker sees it: period, text, and its recorded metrics.
 * The metrics used to be left out, so a bullet quoting a recorded figure
 * ("8x ROAS", stored only as a metric) was judged unsupported — the code
 * checks had already proven the figure was recorded, and the model was never
 * shown it.
 */
function sourceLine(item: EvidenceItem): string {
  const metrics = item.metrics.map((m) => m.raw).join(' ; ')
  return `[${item.period.start}–${item.period.end ?? 'present'}] ${item.text}${metrics ? ` (recorded metrics: ${metrics})` : ''}`
}

/** Every keyword the posting itself introduced — an entity a bullet may name uncited. */
export function postingVocabularyOf(requirements: Requirement[]): Set<string> {
  return new Set(
    requirements.flatMap((r) => [r.keyword, ...r.variants]).map((v) => v.toLowerCase()),
  )
}
