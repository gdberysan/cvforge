import { z } from 'zod'
import type { Coverage, EvidenceMapping, Requirement, Verdict } from '@/lib/schemas'
import { VerdictSchema } from '@/lib/schemas'

export type Strength = EvidenceMapping['strength']

/**
 * Validated, not merely typed: the snapshot makes a round trip through a URL
 * on its way back to the application page, so a hand-edited one must render
 * nothing rather than crash the page.
 */
export const SnapshotSchema = z.object({
  verdict: VerdictSchema,
  strengths: z.record(z.string(), z.enum(['strong', 'partial', 'none'])),
})
export type Snapshot = z.infer<typeof SnapshotSchema>

export type Move = {
  requirementId: string
  keyword: string
  before: Strength
  after: Strength
}

export type GapDelta = {
  moves: Move[]
  verdictBefore: Verdict
  verdictAfter: Verdict
  verdictChanged: boolean
}

export function takeSnapshot(input: { coverage: Coverage; mappings: EvidenceMapping[] }): Snapshot {
  const strengths: Record<string, Strength> = {}
  for (const mapping of input.mappings) strengths[mapping.requirementId] = mapping.strength
  return { verdict: input.coverage.verdict, strengths }
}

/**
 * Everything that changed, in requirement order — including moves that only
 * went partway, and moves that went backwards.
 *
 * This is the screen the user reads to decide whether the flow was worth the
 * money, so it reports what happened rather than what would be encouraging. A
 * delta that only ever rendered good news would quietly teach them to keep
 * typing until it did, which is exactly the pressure this feature exists to
 * avoid applying.
 */
export function computeDelta(
  before: Snapshot,
  after: Snapshot,
  requirements: Requirement[],
): GapDelta {
  const moves: Move[] = []

  for (const requirement of requirements) {
    const from = before.strengths[requirement.id] ?? 'none'
    const to = after.strengths[requirement.id] ?? 'none'
    if (from === to) continue
    moves.push({
      requirementId: requirement.id,
      keyword: requirement.keyword,
      before: from,
      after: to,
    })
  }

  return {
    moves,
    verdictBefore: before.verdict,
    verdictAfter: after.verdict,
    verdictChanged: before.verdict !== after.verdict,
  }
}
