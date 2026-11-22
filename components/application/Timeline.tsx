import { OutcomeChip } from '@/components/pipeline/OutcomeChip'
import type { OutcomeEvent } from '@/lib/schemas'

/**
 * What happened, newest first (the same order as the mail and "Tú"), with
 * the day it happened; the year only when it is not this one. The log is
 * the truth.
 */
export function Timeline({ outcomes, locale }: { outcomes: OutcomeEvent[]; locale: string }) {
  const sorted = [...outcomes].sort((a, b) => b.at.localeCompare(a.at))
  const tag = locale === 'es' ? 'es-MX' : 'en-US'
  const thisYear = new Date().getFullYear()
  const short = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' })
  const long = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' })
  const day = { format: (d: Date) => (d.getFullYear() === thisYear ? short : long).format(d) }
  return (
    <ol className="timeline">
      {sorted.map((o) => (
        <li key={`${o.at}-${o.type}`}>
          <time className="timeline-day" dateTime={o.at}>
            {day.format(new Date(o.at))}
          </time>
          <span className="you-what">
            <OutcomeChip type={o.type} />
          </span>
        </li>
      ))}
    </ol>
  )
}
