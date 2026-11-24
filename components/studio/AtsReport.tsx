'use client'

import { useMemo } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { type AtsRow, atsReport } from '@/lib/ats'
import type { CVContent, EvidenceMapping, Requirement } from '@/lib/schemas'

/**
 * The CV as an applicant-tracking system's literal match reads it: the
 * posting's must-haves your record supports and how many the CV says, then
 * the terms it leaves out though your record supports them (the fixable
 * ones), the ones it says, and the ones nothing on file supports, which it
 * rightly does not claim. Folded; the count is the headline.
 */
export function AtsReport({
  cv,
  requirements,
  mappings,
}: {
  cv: CVContent
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}) {
  const t = useT()
  const report = useMemo(() => atsReport(cv, requirements, mappings), [cv, requirements, mappings])
  if (report.rows.length === 0) return null
  const groups: { key: AtsRow['status']; rows: AtsRow[] }[] = [
    { key: 'supported-missing', rows: report.rows.filter((r) => r.status === 'supported-missing') },
    { key: 'on-cv', rows: report.rows.filter((r) => r.status === 'on-cv') },
    { key: 'no-evidence', rows: report.rows.filter((r) => r.status === 'no-evidence') },
  ]
  return (
    <details className="ats-report">
      <summary>
        {report.supportedMandatory > 0
          ? t('ats.summary', { n: report.onCvMandatory, total: report.supportedMandatory })
          : t('ats.summaryNone')}
      </summary>
      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.key} className={`ats-group ats-${g.key}`}>
            <h4>{t(`ats.group.${g.key}`)}</h4>
            <p className="ats-hint">{t(`ats.hint.${g.key}`)}</p>
            <ul className="ats-terms">
              {g.rows.map((r) => (
                <li key={r.requirementId}>
                  {r.keyword}
                  {r.matched && r.matched.toLowerCase() !== r.keyword.toLowerCase() && (
                    <span className="ats-as"> · {t('ats.as', { word: r.matched })}</span>
                  )}
                  {r.mandatory && <span className="ats-must"> · {t('ats.must')}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </details>
  )
}
