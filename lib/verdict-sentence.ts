import { type Locale, plural, type Translate } from '@/lib/i18n'
import { localeTag } from '@/lib/locale-tag'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'

const NAMED = 3

/** Mandatory requirements nothing evidences — unjudged ones excluded: nobody judged them unmet. */
export function missingMandatory(
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): Requirement[] {
  const byId = new Map(mappings.map((m) => [m.requirementId, m]))
  return requirements.filter((r) => {
    const m = byId.get(r.id)
    return r.mandatory && !m?.unjudged && (m?.strength ?? 'none') === 'none'
  })
}

function listOf(t: Translate, locale: Locale, words: string[]): string {
  const shown = words.slice(0, NAMED)
  const rest = words.length - shown.length
  const items = rest > 0 ? [...shown, t('verdictSay.more', { n: rest })] : shown
  return new Intl.ListFormat(localeTag(locale), { type: 'conjunction' }).format(items)
}

/**
 * The one sentence under the verdict, built only from stored data. Keywords
 * are printed exactly as extracted — this never paraphrases a requirement.
 */
export function verdictSentence(
  t: Translate,
  locale: Locale,
  {
    coverage,
    requirements,
    mappings,
  }: { coverage: Coverage; requirements: Requirement[]; mappings: EvidenceMapping[] },
): string {
  if (requirements.length === 0) return t('verdictSay.nothing')
  if (coverage.verdict === 'skip' && coverage.hardBlockers.length > 0) {
    return plural(t, coverage.hardBlockers.length, 'verdictSay.blocked', {
      list: listOf(
        t,
        locale,
        coverage.hardBlockers.map((r) => r.keyword),
      ),
    })
  }
  if (coverage.mandatoryTotal === 0) {
    return t('verdictSay.desirableOnly', {
      strong: coverage.desirableStrong,
      total: coverage.desirableTotal,
    })
  }
  const covered = t('verdictSay.covered', {
    strong: coverage.mandatoryStrong,
    total: coverage.mandatoryTotal,
  })
  const missing = missingMandatory(requirements, mappings).map((r) => r.keyword)
  const tail =
    missing.length === 0
      ? t('verdictSay.noneMissing')
      : plural(t, missing.length, 'verdictSay.missing', { list: listOf(t, locale, missing) })
  return `${covered} ${tail}`
}
