'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { MessageKey } from '@/lib/i18n'
import type { InterviewView } from '@/lib/seguimiento-view'

export type BriefPerson = { name: string; role: string; roleQuote: string }

/** Only a web meeting link is ever offered as a button. */
function safeMeetingUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function whenKey(view: InterviewView | null): { key: MessageKey; n?: number } {
  if (view?.state !== 'scheduled') return { key: 'prep.when.unknown' }
  const d = view.daysFromToday
  const screen = view.kind === 'screen'
  if (d < 0) return { key: 'prep.when.past' }
  if (d === 0) return { key: screen ? 'prep.when.screenToday' : 'prep.when.today' }
  if (d === 1) return { key: screen ? 'prep.when.screenTomorrow' : 'prep.when.tomorrow' }
  return { key: screen ? 'prep.when.screenInDays' : 'prep.when.inDays', n: d }
}

/** Who, when, and the way in: the first thing read before the call. */
export function PrepBriefing({
  interview,
  people,
  meetingUrl,
  note,
  noteFlag,
}: {
  interview: InterviewView | null
  people: BriefPerson[]
  meetingUrl: string | null
  note: string
  /** Why the note should be checked, when the check doubted it. */
  noteFlag?: string
}) {
  const t = useT()
  const when = whenKey(interview)
  const join = safeMeetingUrl(meetingUrl)
  const scheduled = interview?.state === 'scheduled' ? interview : null
  return (
    <section className="prep-brief" aria-label={t('prep.title')}>
      <p className="prep-when">{t(when.key, when.n !== undefined ? { n: when.n } : undefined)}</p>
      {scheduled && (
        <div className="prep-date">
          {/* The same tile as the Seguimiento interview card. */}
          <div className="meeting-tile" aria-hidden>
            <span className="meeting-tile-month">{scheduled.month}</span>
            <span className="meeting-tile-day">{scheduled.day}</span>
          </div>
          <p className="prep-date-text">
            <span className="sr-only">{scheduled.longDate} </span>
            <span aria-hidden>{scheduled.weekday}</span>
            {scheduled.time && <span className="prep-time">{scheduled.time}</span>}
          </p>
        </div>
      )}
      {people.length > 0 ? (
        <ul className="prep-people">
          {people.map((p) => (
            <li key={p.name}>
              <span className="prep-person">{p.name}</span>
              <span className="prep-role">{p.role || t('prep.roleUnknown')}</span>
              {p.roleQuote && (
                <details className="prep-quote">
                  <summary>{t('prep.roleSource')}</summary>
                  <p>“{p.roleQuote}”</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="prep-muted">{t('prep.noPeople')}</p>
      )}
      {join && (
        <a
          className="btn btn-quiet prep-join"
          href={join}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('prep.join')}
        </a>
      )}
      {note && <p className="prep-note">{note}</p>}
      {note && noteFlag && <p className="prep-flag">{t('prep.flag', { reason: noteFlag })}</p>}
    </section>
  )
}
