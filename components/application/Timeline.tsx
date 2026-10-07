import type { Translate } from '@/lib/i18n'
import type { OutcomeEvent } from '@/lib/schemas'

/** What happened, oldest first, with the day it happened. The log is the truth. */
export function Timeline({
  outcomes,
  t,
  locale,
}: {
  outcomes: OutcomeEvent[]
  t: Translate
  locale: string
}) {
  const sorted = [...outcomes].sort((a, b) => a.at.localeCompare(b.at))
  const day = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return (
    <ol className="timeline">
      {sorted.map((o) => (
        <li key={`${o.at}-${o.type}`}>
          <span className="fact" style={{ color: 'var(--text-faint)' }}>
            {day.format(new Date(o.at))}
          </span>
          <span style={{ color: 'var(--text-strong)' }}>{t(`outcome.${o.type}`)}</span>
        </li>
      ))}
    </ol>
  )
}
