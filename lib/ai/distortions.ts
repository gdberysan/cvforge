import type { EvidenceItem, GroundingReport, Requirement } from '@/lib/schemas'
import { checkDistortions } from './stages/verify-distortion'

/** The reason a line carries when the check never judged it (fail-closed). */
export const NO_VERDICT_REASON = 'distortion check returned no verdict for this text'

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
   * A role record adds its role's title and employer, so naming the employer
   * the work was done for is not read as an invented one.
   */
  extraSources: Map<string, string> = new Map(),
  reasonLanguage?: 'en' | 'es',
  /** The role applied for: naming it is fine, claiming to hold it is not. */
  targetTitle?: string,
): Promise<GroundingReport['distortions']> {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]))
  // Verdicts come back by id, so two lines sharing one (the composer numbers
  // bullets itself) used to share a verdict: the last answered for both, and
  // a flagged line could pass. A repeated id is asked under its own key.
  const seen = new Map<string, number>()
  const keys = candidates.map((c) => {
    const n = (seen.get(c.id) ?? 0) + 1
    seen.set(c.id, n)
    return n === 1 ? c.id : `${c.id}#${n}`
  })
  const asked = candidates.map((c, i) => ({
    id: keys[i],
    text: c.text,
    sources: c.citedEvidenceIds.flatMap((id) => {
      const item = evidenceById.get(id)
      const extra = extraSources.get(id)
      return [
        item ? sourceLine(item) : '',
        extra === undefined
          ? ''
          : item
            ? `[${item.sourceRef.type === 'project' ? 'project' : 'role'}] ${extra}`
            : id.startsWith('profile:')
              ? `[profile] ${extra}`
              : id.startsWith('gap:')
                ? `[known gap] ${extra}`
                : `[credential] ${extra}`,
      ].filter(Boolean)
    }),
  }))
  // A failed check must not cost the paid draft it was checking: every line
  // then goes unjudged (asked once more below, then failing closed), and the
  // caller ships the draft with those lines flagged.
  let verdicts: Awaited<ReturnType<typeof checkDistortions>> = []
  try {
    verdicts = await checkDistortions(asked, reasonLanguage, targetTitle)
  } catch {
    verdicts = []
  }
  // On a long CV the batched call can skip a line. Those lines are asked once
  // more on their own; if that call fails too they fail closed below, as
  // before — the retry must never turn one unjudged line into a lost run.
  const answered = new Set(verdicts.map((v) => v.bulletId))
  const missing = asked.filter((b) => !answered.has(b.id))
  if (missing.length > 0) {
    try {
      verdicts.push(...(await checkDistortions(missing, reasonLanguage, targetTitle)))
    } catch {
      // fail closed below
    }
  }

  const verdictById = new Map(verdicts.map((v) => [v.bulletId, v]))
  return candidates.flatMap((c, i) => {
    const v = verdictById.get(keys[i])
    if (!v) return [{ bulletId: c.id, reason: NO_VERDICT_REASON }]
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
