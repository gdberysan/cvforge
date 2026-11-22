import { callDayLabel } from '@/lib/call-line'
import type { Locale } from '@/lib/i18n'
import { localeTag } from '@/lib/locale-tag'
import type { InterviewCard, InterviewKind, Sender, ThreadView, YouItem } from '@/lib/mail-thread'
import type { OutcomeType } from '@/lib/schemas/application'
import { safeZone, storedMs } from '@/lib/time'

/**
 * Seguimiento's thread, ready to print (spec 2026-10-17 §1.3.4). Every date
 * is formatted here, on the server, in the user's zone — the client
 * components receive strings, so the page cannot render one date on the
 * server and another in the browser (React #418). Pure: `now`, the zone and
 * the locale come in.
 */

export type FoldedView = {
  key: string
  date: string
  dateTime: string
  subject: string
  from: string | null
  link: string
}

export type ThreadCardView = {
  key: string
  /** event: an outcome the agent logged from this email; mail: an email alone. */
  kind: 'event' | 'mail'
  chip: OutcomeType | 'mail'
  date: string
  /** Machine-readable, for <time dateTime>. */
  dateTime: string
  subject: string | null
  from: string | null
  quote: string
  link: string | null
  /** The outcome Undo removes; null on a plain email. */
  outcomeId: string | null
  folded: FoldedView[]
}

export type YouView = {
  key: string
  kind: YouItem['kind']
  type: OutcomeType | null
  date: string
  dateTime: string
  note: string | null
}

export type InterviewView =
  | {
      state: 'scheduled'
      outcomeId: string
      kind: InterviewKind
      /** Calendar tile: "oct" / "Oct". */
      month: string
      day: number
      /** "martes" — the weekday, in the user's locale. */
      weekday: string
      /** "martes, 20 de octubre" — what the tile says, for a screen reader. */
      longDate: string
      /** "mar 20 oct": the day in the shared call wording (lib/call-line). */
      dayLabel: string
      /** "10:00 a.m."; null for a date-only value. */
      time: string | null
      /** Local calendar days from today: 0 today, 1 tomorrow, -1 yesterday. */
      daysFromToday: number
      /** agent: positively from a calendar invite; null: unknown, so unsaid. */
      source: 'agent' | null
      /** The editor's date field, `YYYY-MM-DD`, in the user's zone. */
      inputDate: string
      /** The editor's time field, `HH:mm`; '' for a date-only value — never invented. */
      inputTime: string
    }
  | { state: 'prompt'; outcomeId: string; kind: InterviewKind }

export type SeguimientoView = {
  cards: ThreadCardView[]
  count: number
  you: YouView[]
  interview: InterviewView | null
}

export type ViewInput = {
  view: ThreadView
  /** The application's company: the sender line's name when the email has none. */
  company: string
  locale: Locale
  timeZone: string
  now: number
}

/**
 * "Name · domain" when the email named itself; otherwise the application's
 * company stands in for the name. That is the truth, not a guess: the row is
 * tied to this application, and the live pass stores only the bare address.
 */
export function senderLine(sender: Sender | null, company: string): string | null {
  if (!sender) return null
  if (sender.name) return sender.label
  const name = company.trim()
  return name && sender.domain ? `${name} · ${sender.domain}` : sender.label
}

/** "16 oct" — with the year only when it is not this year. */
export function dayLabel(iso: string, locale: Locale, timeZone: string, now: number): string {
  const t = storedMs(iso)
  if (Number.isNaN(t)) return ''
  const zone = safeZone(timeZone)
  const yearOf = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: zone }).format(new Date(ms))
  const sameYear = yearOf(t) === yearOf(now)
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: zone,
  })
    .format(new Date(t))
    .replace(/\.(?=\s|$)/g, '')
}

const pad = (n: number) => String(n).padStart(2, '0')

function interviewView(card: InterviewCard | null, locale: Locale): InterviewView | null {
  if (!card) return null
  if (card.state === 'prompt') return card
  // The builder already read the stored value in the user's zone; these
  // parts are that local wall time, so format them as UTC to keep them.
  const [hh, mm] = (card.time ?? '00:00').split(':').map(Number) as [number, number]
  const wall = new Date(Date.UTC(card.year, card.month - 1, card.day, hh, mm))
  const tag = localeTag(locale)
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, { ...o, timeZone: 'UTC' }).format(wall)
  return {
    state: 'scheduled',
    outcomeId: card.outcomeId,
    kind: card.kind,
    month: fmt({ month: 'short' }).replace(/\.$/, ''),
    day: card.day,
    weekday: fmt({ weekday: 'long' }),
    longDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    dayLabel: callDayLabel(card, locale),
    time: card.time ? fmt({ hour: 'numeric', minute: '2-digit' }) : null,
    daysFromToday: card.daysFromToday,
    source: card.source,
    inputDate: `${card.year}-${pad(card.month)}-${pad(card.day)}`,
    inputTime: card.time ?? '',
  }
}

export function seguimientoView({
  view,
  company,
  locale,
  timeZone,
  now,
}: ViewInput): SeguimientoView {
  const day = (iso: string) => dayLabel(iso, locale, timeZone, now)
  return {
    count: view.count,
    cards: view.cards.map((c) => ({
      key: c.key,
      kind: c.type,
      chip: c.chip,
      date: day(c.at),
      dateTime: c.at,
      subject: c.subject,
      from: senderLine(c.sender, company),
      quote: c.type === 'event' ? c.quote : '',
      link: c.link,
      outcomeId: c.type === 'event' ? c.outcomeId : null,
      folded: c.folded.map((f) => ({
        key: f.messageId,
        date: day(f.at),
        dateTime: f.at,
        subject: f.subject,
        from: senderLine(f.sender, company),
        link: f.link,
      })),
    })),
    you: view.you.map((y) => ({
      key: y.key,
      kind: y.kind,
      type: y.type,
      date: day(y.at),
      dateTime: y.at,
      note: y.note,
    })),
    interview: interviewView(view.interview, locale),
  }
}
