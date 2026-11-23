import { buildEntityIndex } from '@/lib/ai/projection'
import type { EvidenceItem, GroundingReport, MasterProfile } from '@/lib/schemas'
import { allowedQuantityForms } from './checks'
import {
  extractCounts,
  extractQuantities,
  extractYearSpans,
  normaliseQuantity,
  numbersIn,
} from './quantities'
import { recordedYears } from './sections'

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
  /** Mapped credential id → its line; a valid citation, though not an evidence record. */
  selectedCredentials: Map<string, string>
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
    unsupportedClaims: [],
    passed: true,
  }
  const careerYears = recordedYears(args.profile.experience.map((r) => r.period))

  const evidenceById = new Map(args.evidence.map((e) => [e.id, e]))
  const entityIndex = buildEntityIndex(args.profile, args.evidence)
  const posting = args.postingVocabulary ?? new Set<string>()

  for (const paragraph of args.paragraphs) {
    const citedItems: EvidenceItem[] = []
    const citedCredentials: string[] = []
    for (const id of paragraph.citedEvidenceIds) {
      const credential = args.selectedCredentials.get(id)
      if (credential !== undefined) {
        citedCredentials.push(credential)
        continue
      }
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
    // A credential line has no metrics, but a figure printed on it is still
    // its own fact ("TOEFL 110" is not, "Score 95%" would be).
    for (const line of citedCredentials) {
      for (const token of extractQuantities(line)) allowed.add(normaliseQuantity(token))
    }
    for (const token of extractQuantities(paragraph.text)) {
      if (!allowed.has(normaliseQuantity(token))) {
        report.unverifiedNumbers.push({ bulletId: paragraph.id, token })
      }
    }
    // Bare counts and spans of years, as on the CV: a count must be stated in
    // what the paragraph cites; years may not exceed the career on record.
    const stated = numbersIn(
      [
        ...citedItems.flatMap((item) => [
          item.text,
          ...item.metrics.map((m) => `${m.raw} ${m.value ?? ''}`),
        ]),
        ...citedCredentials,
      ].join('\n'),
    )
    for (const count of extractCounts(paragraph.text)) {
      if (!stated.has(count))
        report.unverifiedNumbers.push({ bulletId: paragraph.id, token: `${count}` })
    }
    for (const years of extractYearSpans(paragraph.text)) {
      if (years > Math.round(careerYears) && !stated.has(years))
        report.unverifiedNumbers.push({ bulletId: paragraph.id, token: `${years}` })
    }

    for (const word of paragraph.text.split(/\s+/).slice(1)) {
      const entity = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#.]+$/gu, '')
      if (entity.length < 2 || !/^\p{Lu}/u.test(entity)) continue
      const lower = entity.toLowerCase()
      if (entityIndex.has(lower) || posting.has(lower)) continue
      if (citedItems.some((item) => item.text.toLowerCase().includes(lower))) continue
      if (citedCredentials.some((line) => line.toLowerCase().includes(lower))) continue
      report.unknownEntities.push({ bulletId: paragraph.id, entity })
    }
  }

  report.passed = report.invalidCitations.length === 0 && report.unverifiedNumbers.length === 0
  return report
}
