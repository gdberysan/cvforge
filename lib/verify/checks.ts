import { buildEntityIndex } from '@/lib/ai/projection'
import type { CVContent, EvidenceItem, GroundingReport, MasterProfile } from '@/lib/schemas'
import { extractQuantities, normaliseQuantity } from './quantities'

/** Capitalised words and obvious tech tokens. Sentence-initial words are skipped. */
function extractEntities(text: string): string[] {
  const words = text.split(/\s+/)
  const entities: string[] = []

  words.forEach((raw, i) => {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#.]+$/gu, '')
    if (word.length < 2) return
    if (i === 0) return // sentence-initial capitalisation carries no signal
    const isCapitalised = /^\p{Lu}/u.test(word)
    const isTechToken = /[0-9+#.]/.test(word) && /\p{L}/u.test(word)
    if (isCapitalised || isTechToken) entities.push(word)
  })

  return entities
}

const COMMON_WORDS = new Set([
  'i',
  'a',
  'the',
  'and',
  'or',
  'for',
  'with',
  'led',
  'built',
  'drove',
  'cut',
  'grew',
  'reduced',
  'increased',
  'delivered',
  'managed',
  'designed',
  'shipped',
  'owned',
])

/**
 * The half of the grounding promise that costs nothing and cannot be talked
 * out of its answer: citations, quantities, and entities verified in plain
 * code, no model call. Unknown entities are a soft signal — they flag for
 * review but do not fail the report; invented numbers and bad citations do.
 */
export function runDeterministicChecks(args: {
  cv: CVContent
  evidence: EvidenceItem[]
  profile: MasterProfile
  selectedEvidenceIds: Set<string>
  postingVocabulary?: Set<string>
  /** Lower-cased keyword (or variant) of a requirement that mapped to
   *  nothing, mapped to that requirement's own text — the free-text
   *  rationale a claimed-gap flag shows, the same way the AI
   *  distortion-check quotes conflicting source wording. */
  knownGaps?: Map<string, string>
}): GroundingReport {
  const report: GroundingReport = {
    uncitedBullets: [],
    invalidCitations: [],
    unverifiedNumbers: [],
    unknownEntities: [],
    distortions: [],
    claimedGaps: [],
    passed: true,
  }

  const evidenceById = new Map(args.evidence.map((e) => [e.id, e]))
  const entityIndex = buildEntityIndex(args.profile, args.evidence)
  const posting = args.postingVocabulary ?? new Set<string>()
  const gapMatchers = [...(args.knownGaps ?? new Map())].map(
    ([keyword, requirementText]) => [keyword, requirementText, wholeWord(keyword)] as const,
  )

  for (const role of args.cv.experience) {
    for (const bullet of role.bullets) {
      // 0. A known gap asserted as an achievement. Checked before anything
      // else because it is independent of citations — a bullet can cite real
      // evidence and still smuggle in the one skill the analysis said is missing.
      for (const [keyword, requirementText, matcher] of gapMatchers) {
        if (matcher.test(bullet.text))
          report.claimedGaps.push({ bulletId: bullet.id, keyword, requirementText })
      }

      // 1. Citation presence.
      if (bullet.citedEvidenceIds.length === 0) {
        report.uncitedBullets.push(bullet.id)
        continue
      }

      // 2. Citation validity — must exist AND have been selected for composition.
      const citedItems: EvidenceItem[] = []
      for (const id of bullet.citedEvidenceIds) {
        const item = evidenceById.get(id)
        if (!item || !args.selectedEvidenceIds.has(id)) {
          report.invalidCitations.push({ bulletId: bullet.id, evidenceId: id })
        } else {
          citedItems.push(item)
        }
      }

      // 3. Every quantity must exist in a cited item's metrics, unit and
      // currency included. EXACT equality after normalisation: substring
      // matching once let an invented $80k pass against a recorded $180k —
      // the one class of fabrication this check exists to catch. Metric raws
      // carry prose ("subí ROAS 3.4x"), so their quantities are extracted the
      // same way the bullet's are before comparing.
      const allowed = allowedQuantityForms(citedItems)
      for (const token of extractQuantities(bullet.text)) {
        if (!allowed.has(normaliseQuantity(token))) {
          report.unverifiedNumbers.push({ bulletId: bullet.id, token })
        }
      }

      // 4. Entity index — soft signal only.
      for (const entity of extractEntities(bullet.text)) {
        const lower = entity.toLowerCase()
        if (COMMON_WORDS.has(lower)) continue
        if (entityIndex.has(lower) || posting.has(lower)) continue
        if (citedItems.some((item) => item.text.toLowerCase().includes(lower))) continue
        report.unknownEntities.push({ bulletId: bullet.id, entity })
      }
    }
  }

  report.passed =
    report.uncitedBullets.length === 0 &&
    report.invalidCitations.length === 0 &&
    report.unverifiedNumbers.length === 0 &&
    report.claimedGaps.length === 0

  return report
}

/** Every normalised quantity a set of cited items can support. */
export function allowedQuantityForms(citedItems: EvidenceItem[]): Set<string> {
  return new Set(
    citedItems.flatMap((item) =>
      item.metrics.flatMap((m) => {
        const forms = extractQuantities(m.raw).map(normaliseQuantity)
        if (m.value !== undefined) {
          if (m.unit) forms.push(normaliseQuantity(`${m.value}${m.unit}`))
          // A money metric stores its currency beside the value, with or
          // without a unit: "$1.2M" parsed from the editor has currency MXN
          // and no unit at all. Both the code-explicit form the composer is
          // invited to write ("1.2M MXN") and the bare figure are honest.
          if (m.currency) {
            forms.push(normaliseQuantity(`${m.value}${m.currency}`))
            forms.push(normaliseQuantity(`${m.value}`))
          }
        }
        return forms
      }),
    ),
  )
}

/** Whole-word, case-insensitive, Unicode-aware — "SQLite" is not a claim of "SQL". */
function wholeWord(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
}
