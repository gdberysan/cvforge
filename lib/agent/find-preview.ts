import { type GroupTone, groupByTone, type ToneRow } from '@/lib/requirement-tone'
import type { FindAnalysis } from './chase'

/**
 * What Hoy's preview sheet says about a find's fit, from the analysis the
 * agent stored — the card's "7 de 11" and the sheet's chips from one place,
 * so they cannot disagree. Mandatory requirements only, the ones the verdict
 * rests on; each judged by the decide step's rule (lib/requirement-tone):
 * strength from its mapping, an unjudged mapping shown as unjudged rather
 * than missing, a hard blocker leading its group. Counts are the stored
 * coverage's, never recounted. Only keywords leave: no rationale, evidence
 * ids or requirement text reach the client.
 */
export type FindPreview = {
  /** Mandatory requirements met (`coverage.mandatoryStrong`). */
  strong: number
  /** Mandatory requirements in all; 0 is an extraction that found none. */
  total: number
  groups: { tone: GroupTone; rows: ToneRow[] }[]
}

export function findPreview(
  a: Pick<FindAnalysis, 'requirements' | 'mappings' | 'coverage'>,
): FindPreview {
  // `?? []`: a row an older satellite wrote may lack a field; it reads as
  // "nothing judged", never as a crash on Hoy.
  const mappingOf = new Map((a.mappings ?? []).map((m) => [m.requirementId, m]))
  const blockers = new Set((a.coverage.hardBlockers ?? []).map((r) => r.id))
  const rows: ToneRow[] = (a.requirements ?? [])
    .filter((r) => r.mandatory)
    .map((r) => {
      const m = mappingOf.get(r.id)
      return {
        keyword: r.keyword,
        strength: m?.strength ?? 'none',
        unjudged: m?.unjudged === true,
        blocker: blockers.has(r.id),
      }
    })
  const c = a.coverage
  return {
    strong: c.mandatoryStrong,
    total: c.mandatoryStrong + c.mandatoryPartial + c.mandatoryMissing,
    groups: groupByTone(rows),
  }
}
