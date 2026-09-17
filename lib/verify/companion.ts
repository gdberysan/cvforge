import { buildEntityIndex } from '@/lib/ai/projection'
import type { EvidenceItem, GroundingReport, MasterProfile } from '@/lib/schemas'
import { allowedQuantityForms } from './checks'
import { extractQuantities, normaliseQuantity } from './quantities'

/**
 * The companion variant of the deterministic checks. Unlike CV bullets, a
 * paragraph may cite nothing — a hook or a close is rhetoric, not a claim —
 * so uncited paragraphs never fail on citation alone. What they cannot do is
 * carry a number: with no cited metrics, every quantity in an uncited
 * paragraph is unverified by construction.
 */
export function runCompanionChecks(args: {
  paragraphs: { id: string; text: string; citedEvidenceIds: string[] }[]
  evidence: EvidenceItem[]
  profile: MasterProfile
  selectedEvidenceIds: Set<string>
  postingVocabulary?: Set<string>
}): GroundingReport {
  const report: GroundingReport = {
    uncitedBullets: [],
    invalidCitations: [],
    unverifiedNumbers: [],
    unknownEntities: [],
    distortions: [],
    // Companions may name a gap honestly ("I have not worked with X directly"),
    // so the claimed-gap check is a CV-only rule; the distortion pass covers them.
    claimedGaps: [],
    passed: true,
  }

  const evidenceById = new Map(args.evidence.map((e) => [e.id, e]))
  const entityIndex = buildEntityIndex(args.profile, args.evidence)
  const posting = args.postingVocabulary ?? new Set<string>()

  for (const paragraph of args.paragraphs) {
    const citedItems: EvidenceItem[] = []
    for (const id of paragraph.citedEvidenceIds) {
      const item = evidenceById.get(id)
      if (!item || !args.selectedEvidenceIds.has(id)) {
        report.invalidCitations.push({ bulletId: paragraph.id, evidenceId: id })
      } else {
        citedItems.push(item)
      }
    }

    // Exact equality after normalisation — substring matching once let an
    // invented $80k pass against a recorded $180k. One shared definition
    // with the CV checker so the two can never drift apart again.
    const allowed = allowedQuantityForms(citedItems)
    for (const token of extractQuantities(paragraph.text)) {
      if (!allowed.has(normaliseQuantity(token))) {
        report.unverifiedNumbers.push({ bulletId: paragraph.id, token })
      }
    }

    for (const word of paragraph.text.split(/\s+/).slice(1)) {
      const entity = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#.]+$/gu, '')
      if (entity.length < 2 || !/^\p{Lu}/u.test(entity)) continue
      const lower = entity.toLowerCase()
      if (entityIndex.has(lower) || posting.has(lower)) continue
      if (citedItems.some((item) => item.text.toLowerCase().includes(lower))) continue
      report.unknownEntities.push({ bulletId: paragraph.id, entity })
    }
  }

  report.passed = report.invalidCitations.length === 0 && report.unverifiedNumbers.length === 0
  return report
}
