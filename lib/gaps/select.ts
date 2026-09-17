import { type EvidenceMapping, GATING_KINDS, type Requirement } from '@/lib/schemas'

export type GapStrength = 'none' | 'partial'

export type Gap = {
  requirement: Requirement
  /** The mapper's own reason for the miss. Empty when no mapping row exists. */
  rationale: string
  strength: GapStrength
}

export type GapSelection = {
  /** Required, unmet, and answerable — the list the screen leads with. */
  primary: Gap[]
  /** Partials worth upgrading, plus non-mandatory misses. Collapsed by default. */
  secondary: Gap[]
  /**
   * Unmet location / timezone / authorization requirements. Never answerable:
   * the mapper judges these against the profile's own lines, not against
   * evidence (`PROFILE_JUDGED` in `lib/ai/stages/map-evidence.ts`), so writing
   * prose about them changes nothing. Returned separately so the screen can
   * send the user to the profile editor rather than silently dropping them.
   */
  blockers: Requirement[]
}

/**
 * Splits a posting's requirements into the ones a person could answer from
 * memory and the ones no amount of writing will move.
 *
 * Order is the posting's own throughout: the user is reading this beside the
 * requirements list on the application page, and a reshuffled list reads as a
 * different set of facts.
 */
export function selectGaps(requirements: Requirement[], mappings: EvidenceMapping[]): GapSelection {
  const byRequirement = new Map(mappings.map((m) => [m.requirementId, m]))
  const selection: GapSelection = { primary: [], secondary: [], blockers: [] }
  const noMandatory = requirements.every((r) => !r.mandatory)

  for (const requirement of requirements) {
    const mapping = byRequirement.get(requirement.id)
    const strength = mapping?.strength ?? 'none'
    if (strength === 'strong') continue

    // A location, timezone or authorization requirement is never something to
    // write evidence against. It is a blocker only under the same rule
    // computeCoverage gates on — unmet, and mandatory unless nothing was —
    // otherwise this page would tell the user to fix a requirement the
    // verdict did not hold against them.
    if (GATING_KINDS.has(requirement.kind)) {
      if (strength === 'none' && (requirement.mandatory || noMandatory)) {
        selection.blockers.push(requirement)
      }
      continue
    }

    const gap: Gap = { requirement, rationale: mapping?.rationale ?? '', strength }
    if (requirement.mandatory && strength === 'none') selection.primary.push(gap)
    else selection.secondary.push(gap)
  }

  return selection
}
