import type { CVContent, EvidenceMapping, Requirement } from '@/lib/schemas'

/**
 * How an applicant-tracking system's literal match would read a CV against
 * its posting: for each requirement, whether the CV says it in the posting's
 * words (its keyword or a variant, whole word), whether the record supports
 * it though the CV leaves it out, or whether nothing on file supports it, so
 * it is rightly not claimed. Code only; nothing here is judged by a model.
 */
export type AtsStatus = 'on-cv' | 'supported-missing' | 'no-evidence'

export type AtsRow = {
  requirementId: string
  keyword: string
  /** The posting's word the CV used, when it used one. */
  matched: string | null
  mandatory: boolean
  status: AtsStatus
}

export type AtsReport = {
  rows: AtsRow[]
  /** Must-haves the record supports, and how many of them the CV says. */
  supportedMandatory: number
  onCvMandatory: number
}

/** Every line a reader sees, as one text. */
export function cvText(cv: CVContent): string {
  return [
    cv.header.title,
    cv.summary,
    ...cv.experience.flatMap((r) => [r.title, ...r.bullets.map((b) => b.text)]),
    // Early career on one line (withWholeHistory) still prints its titles.
    ...(cv.earlierRoles ?? []).map((r) => `${r.title}, ${r.company}`),
    ...cv.projects.flatMap((p) => p.bullets.map((b) => b.text)),
    ...cv.skills.flatMap((s) => [s.category, ...s.items]),
    ...cv.education.map((e) => `${e.degree} ${e.institution}`),
    ...cv.extras.flatMap((x) => [x.heading, ...x.lines]),
  ].join('\n')
}

/** Whole-word, case-insensitive, Unicode-aware: "SQLite" is not "SQL". */
function says(text: string, phrase: string): boolean {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return false
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text)
}

// Location, time zone and work authorization are facts about the person, not
// terms a CV is matched on: they are left out of the report.
const MATCHED_KINDS = new Set(['hard', 'soft'])

export function atsReport(
  cv: CVContent,
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): AtsReport {
  const text = cvText(cv)
  const strength = new Map(mappings.map((m) => [m.requirementId, m.strength]))
  const order: Record<AtsStatus, number> = { 'supported-missing': 0, 'on-cv': 1, 'no-evidence': 2 }
  const rows = requirements
    .filter((r) => MATCHED_KINDS.has(r.kind))
    .map((r): AtsRow => {
      const matched = [r.keyword, ...r.variants].find((p) => says(text, p)) ?? null
      const supported = (strength.get(r.id) ?? 'none') !== 'none'
      return {
        requirementId: r.id,
        keyword: r.keyword,
        matched,
        mandatory: r.mandatory,
        status: matched ? 'on-cv' : supported ? 'supported-missing' : 'no-evidence',
      }
    })
    .sort((a, b) => order[a.status] - order[b.status] || Number(b.mandatory) - Number(a.mandatory))
  const supportedMandatory = rows.filter((r) => r.mandatory && r.status !== 'no-evidence')
  return {
    rows,
    supportedMandatory: supportedMandatory.length,
    onCvMandatory: supportedMandatory.filter((r) => r.status === 'on-cv').length,
  }
}
