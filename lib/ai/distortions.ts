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
): Promise<GroundingReport['distortions']> {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]))
  const verdicts = await checkDistortions(
    candidates.map((c) => ({
      id: c.id,
      text: c.text,
      sources: c.citedEvidenceIds
        .map((id) => {
          const item = evidenceById.get(id)
          return item && `[${item.period.start}–${item.period.end ?? 'present'}] ${item.text}`
        })
        .filter((t): t is string => Boolean(t)),
    })),
  )

  const verdictById = new Map(verdicts.map((v) => [v.bulletId, v]))
  return candidates.flatMap((c) => {
    const v = verdictById.get(c.id)
    if (!v)
      return [{ bulletId: c.id, reason: 'distortion check returned no verdict for this text' }]
    return v.supported ? [] : [{ bulletId: c.id, reason: v.reason }]
  })
}

/** Every keyword the posting itself introduced — an entity a bullet may name uncited. */
export function postingVocabularyOf(requirements: Requirement[]): Set<string> {
  return new Set(
    requirements.flatMap((r) => [r.keyword, ...r.variants]).map((v) => v.toLowerCase()),
  )
}
