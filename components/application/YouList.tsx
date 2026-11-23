'use client'

import { useId } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { OutcomeChip } from '@/components/pipeline/OutcomeChip'
import type { YouView } from '@/lib/seguimiento-view'

/**
 * "Tú" (spec 2026-10-17 §1.3.3): what the user did himself — sending it,
 * each follow-up he said he sent, every outcome he logged by hand. Nothing
 * the agent read appears here; that lives in the thread above. The same
 * grouped list as the mail (mockup Seguimiento2): what, its note, the date.
 */
export function YouList({ items }: { items: YouView[] }) {
  const t = useT()
  const headingId = useId()
  if (items.length === 0) return null
  return (
    <section className="seg-block" aria-labelledby={headingId}>
      <h3 id={headingId} className="seg-heading">
        {t('you.title')}
      </h3>
      {/* The same rows as the plain log: the day, then what happened as a
          chip, so the section reads one way whatever the data source. */}
      <ol className="timeline">
        {items.map((i) => (
          <li key={i.key}>
            <time className="timeline-day" dateTime={i.dateTime}>
              {i.date}
            </time>
            <span className="you-what">
              {i.kind === 'applied' ? (
                <OutcomeChip type="applied" />
              ) : i.kind === 'followUp' || !i.type ? (
                <span className="outcome-chip tone-quiet">
                  <span className="outcome-label">{t('you.followUp')}</span>
                </span>
              ) : (
                <OutcomeChip type={i.type} />
              )}
              {i.note && <span className="you-note">{i.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
