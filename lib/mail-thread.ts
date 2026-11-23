import { parseGmailNote } from '@/lib/gmail-note'
import type { MailThreadItem } from '@/lib/satellite-types'
import type { OutcomeType } from '@/lib/schemas/application'
import { dayIndex, isDateOnly, wallClock } from '@/lib/time'

/**
 * Seguimiento's view model (spec 2026-10-17 §1.3.3): the emails behind an
 * application, what the user did, and the interview to prepare for. Pure —
 * `now` and the user's `timeZone` come in, nothing reads the clock — and it
 * returns kinds and data only; every label is the component's (i18n).
 *
 * Fabrication rule: a card shows only what an email said or the user
 * logged. No time is ever invented: an interview without one asks for it.
 */

/** An outcome-log row with the id Undo and the interview editor need. */
export type ThreadOutcome = {
  id: string
  at: string
  type: OutcomeType
  note: string | null
  scheduledAt: string | null
}

/** A follow-up draft; only one with `usedAt` (the user said he sent it) is listed. */
export type ThreadDraft = { id: string; usedAt: string | null }

export type BuildThreadInput = {
  outcomes: ThreadOutcome[]
  mail: MailThreadItem[]
  drafts: ThreadDraft[]
  /** The connected Gmail address, for the link's `authuser`; null when unknown. */
  account: string | null
  now: number
  /** IANA zone the user lives in, e.g. 'America/Mexico_City'. */
  timeZone: string
}

export type Sender = {
  /** The header's display name; null for a bare address. */
  name: string | null
  /** The address's domain as stored, lower-cased; '' when there is no address. */
  domain: string
  /** "Name · domain", or the domain alone, or the raw value when neither parses. */
  label: string
}

/** A duplicate email folded into its event card ("+N correos más"). */
export type FoldedMail = {
  messageId: string
  at: string
  subject: string
  sender: Sender | null
  link: string
}

/** One outcome the agent logged from an email; the card Undo acts on. */
export type EventCard = {
  type: 'event'
  key: string
  messageId: string
  outcomeId: string
  chip: OutcomeType
  at: string
  quote: string
  /** From the email's row; null when the satellite has no row for it. */
  subject: string | null
  sender: Sender | null
  /** null only for a malformed note that names no message. */
  link: string | null
  /** Newest first. */
  folded: FoldedMail[]
}

/** An email with no outcome of its own: neutral "Correo" chip, no quote. */
export type MailCard = {
  type: 'mail'
  key: string
  messageId: string
  chip: 'mail'
  at: string
  subject: string
  sender: Sender | null
  link: string
  source: MailThreadItem['source']
  folded: []
}

export type ThreadCard = EventCard | MailCard

/** "Tú": what the user did himself. */
export type YouItem = {
  key: string
  /** applied → "La enviaste"; followUp → "Enviaste un seguimiento"; outcome → a hand-logged outcome. */
  kind: 'applied' | 'followUp' | 'outcome'
  at: string
  type: OutcomeType | null
  outcomeId: string | null
  draftId: string | null
  note: string | null
}

export type InterviewKind = 'interview' | 'screen'

export type InterviewCard =
  | {
      state: 'scheduled'
      outcomeId: string
      kind: InterviewKind
      /** As stored: `YYYY-MM-DD` or a UTC ISO instant. */
      scheduledAt: string
      /** The local calendar day in `timeZone`, `YYYY-MM-DD`. */
      date: string
      /** Local `HH:mm`; null for a date-only value. */
      time: string | null
      year: number
      /** 1–12, for the calendar tile's month abbreviation. */
      month: number
      day: number
      /** 0 = Sunday. */
      weekday: number
      /** Local calendar days from today: 0 today, 1 tomorrow, -1 yesterday. */
      daysFromToday: number
      /**
       * agent: an email of this application carries exactly this time (a
       * calendar invite). null: not positively known — the card then claims
       * nothing about where the time came from.
       */
      source: 'agent' | null
    }
  | { state: 'prompt'; outcomeId: string; kind: InterviewKind }

export type ThreadView = {
  /** Newest first. */
  cards: ThreadCard[]
  /** Emails in the thread: every card plus everything folded into one. */
  count: number
  /** Newest first. */
  you: YouItem[]
  interview: InterviewCard | null
}

/** Same reach the satellite's dedupe uses (DEDUPE_WINDOW_MS). */
const FOLD_WINDOW_MS = 14 * 86_400_000
/** A screen and an interview are one event: a call is being set up. */
const eventOf = (kind: string) => (kind === 'screen' || kind === 'interview' ? 'call' : kind)
/** Once one of these follows the interview, asking for its date is noise. */
const ENDED = new Set<OutcomeType>(['rejected', 'withdrawn', 'ghosted', 'offer'])
const PAST_DAYS = 2

export function gmailLink(messageId: string, account: string | null): string {
  const id = encodeURIComponent(messageId)
  return account
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${id}`
    : `https://mail.google.com/mail/#all/${id}`
}

/** `"Acme Talent" <jobs@acme.com>` or a bare address → what the card prints. */
export function senderOf(from: string): Sender | null {
  const raw = from.trim()
  if (!raw) return null
  const angled = /^(.*?)\s*<([^<>]+)>$/.exec(raw)
  const addr = (angled ? (angled[2] ?? '') : raw).trim().toLowerCase()
  let name = angled
    ? (angled[1] ?? '')
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .replace(/\\(.)/g, '$1')
        .trim()
    : ''
  if (name.toLowerCase() === addr) name = ''
  const at = addr.lastIndexOf('@')
  const domain = at >= 0 ? addr.slice(at + 1) : ''
  const label = name && domain ? `${name} · ${domain}` : name || domain || raw
  return { name: name || null, domain, label }
}

const ms = (iso: string) => Date.parse(iso)
const newestFirst = <T extends { at: string }>(a: T, b: T) => ms(b.at) - ms(a.at)

export function buildThread(input: BuildThreadInput): ThreadView {
  const { account } = input

  // One row per message: a live row wins over its history twin.
  const byId = new Map<string, MailThreadItem>()
  for (const m of input.mail) {
    const had = byId.get(m.messageId)
    if (!had || (had.source === 'history' && m.source === 'live')) byId.set(m.messageId, m)
  }

  const events: EventCard[] = []
  const used = new Set<string>()
  for (const o of input.outcomes) {
    const g = parseGmailNote(o.note)
    if (!g) continue
    // Every agent outcome gets its own card and its own Undo — a note with
    // no message id (nothing to link to), and a second outcome on a message
    // already carded, alike. Nothing the agent logged can go unseen.
    const repeat = g.messageId !== '' && used.has(g.messageId)
    if (g.messageId) used.add(g.messageId)
    const row = g.messageId ? byId.get(g.messageId) : undefined
    events.push({
      type: 'event',
      key: g.messageId && !repeat ? g.messageId : `outcome:${o.id}`,
      messageId: g.messageId,
      outcomeId: o.id,
      chip: o.type,
      at: o.at,
      quote: g.quote,
      subject: row ? row.subject : null,
      sender: row ? senderOf(row.from) : null,
      link: g.messageId ? gmailLink(g.messageId, account) : null,
      folded: [],
    })
  }

  const plain: MailCard[] = []
  for (const m of byId.values()) {
    if (used.has(m.messageId)) continue
    const target = m.handledAs === 'duplicate' ? foldTarget(m, events) : null
    if (target) {
      target.folded.push({
        messageId: m.messageId,
        at: m.at,
        subject: m.subject,
        sender: senderOf(m.from),
        link: gmailLink(m.messageId, account),
      })
      continue
    }
    plain.push({
      type: 'mail',
      key: m.messageId,
      messageId: m.messageId,
      chip: 'mail',
      at: m.at,
      subject: m.subject,
      sender: senderOf(m.from),
      link: gmailLink(m.messageId, account),
      source: m.source,
      folded: [],
    })
  }
  for (const e of events) e.folded.sort(newestFirst)

  const cards: ThreadCard[] = [...events, ...plain].sort(newestFirst)
  // Emails, not cards: two outcomes read from one message are one email.
  const emails = new Set<string>()
  for (const c of cards) {
    emails.add(c.messageId || c.key)
    for (const f of c.folded) emails.add(f.messageId)
  }
  const count = emails.size

  return {
    cards,
    count,
    you: youList(input),
    interview: interviewCard(input, byId),
  }
}

/** The same-kind event at or before the duplicate, the latest one, within 14 days. */
function foldTarget(m: MailThreadItem, events: EventCard[]): EventCard | null {
  if (!m.kind) return null
  const t = ms(m.at)
  if (Number.isNaN(t)) return null
  let best: EventCard | null = null
  for (const e of events) {
    if (eventOf(e.chip) !== eventOf(m.kind)) continue
    const et = ms(e.at)
    if (Number.isNaN(et) || et > t || t - et > FOLD_WINDOW_MS) continue
    if (!best || et > ms(best.at)) best = e
  }
  return best
}

function youList({ outcomes, drafts }: BuildThreadInput): YouItem[] {
  const items: YouItem[] = []
  for (const o of outcomes) {
    if (parseGmailNote(o.note)) continue
    items.push({
      key: o.id,
      kind: o.type === 'applied' ? 'applied' : 'outcome',
      at: o.at,
      type: o.type,
      outcomeId: o.id,
      draftId: null,
      note: o.note || null,
    })
  }
  for (const d of drafts) {
    if (!d.usedAt) continue
    items.push({
      key: d.id,
      kind: 'followUp',
      at: d.usedAt,
      type: null,
      outcomeId: null,
      draftId: d.id,
      note: null,
    })
  }
  return items.sort(newestFirst)
}

type Local = { date: string; time: string | null; year: number; month: number; day: number }

/** A stored value read in the user's zone; null when it is not one this app writes. */
function localOf(value: string, timeZone: string): Local | null {
  if (isDateOnly(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number]
    const check = new Date(Date.UTC(y, m - 1, d))
    if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
    return { date: value, time: null, year: y, month: m, day: d }
  }
  const t = Date.parse(value)
  if (Number.isNaN(t) || !/T/.test(value)) return null
  return wallClock(t, timeZone)
}

const sortKey = (l: Local) => `${l.date}T${l.time ?? '00:00'}`

/** Same instant for a datetime, same string for a date. */
function sameTime(a: string, b: string): boolean {
  if (a === b) return true
  if (isDateOnly(a) || isDateOnly(b)) return false
  const ta = Date.parse(a)
  return !Number.isNaN(ta) && ta === Date.parse(b)
}

function interviewCard(
  { outcomes, now, timeZone }: BuildThreadInput,
  byId: Map<string, MailThreadItem>,
): InterviewCard | null {
  const calls = outcomes.filter(
    (o): o is ThreadOutcome & { type: InterviewKind } =>
      o.type === 'interview' || o.type === 'screen',
  )
  if (calls.length === 0) return null
  const today = dayIndex(wallClock(now, timeZone))

  const dated = calls.flatMap((o) => {
    const local = o.scheduledAt ? localOf(o.scheduledAt, timeZone) : null
    return local && o.scheduledAt
      ? [{ o, at: o.scheduledAt, local, days: dayIndex(local) - today }]
      : []
  })
  // A call ahead is off once the process closed after it was booked: a
  // rejection on Thursday cancels Tuesday's interview.
  const closedSince = (o: ThreadOutcome) =>
    outcomes.some((e) => ENDED.has(e.type) && ms(e.at) > ms(o.at))
  const upcoming = dated
    .filter((d) => d.days >= 0 && !closedSince(d.o))
    .sort((a, b) => sortKey(a.local).localeCompare(sortKey(b.local)))[0]
  const recent = dated
    .filter((d) => d.days < 0 && d.days >= -PAST_DAYS)
    .sort((a, b) => sortKey(b.local).localeCompare(sortKey(a.local)))[0]
  const pick = upcoming ?? recent
  if (pick) {
    const { o, local } = pick
    return {
      state: 'scheduled',
      outcomeId: o.id,
      kind: o.type,
      scheduledAt: pick.at,
      date: local.date,
      time: local.time,
      year: local.year,
      month: local.month,
      day: local.day,
      weekday: new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay(),
      daysFromToday: pick.days,
      source: fromInvite(pick.at, byId) ? 'agent' : null,
    }
  }

  // No date to show: ask for one only when the latest call has none and
  // nothing has closed the process since.
  const latest = [...calls].sort(newestFirst)[0]
  if (!latest) return null
  if (latest.scheduledAt && localOf(latest.scheduledAt, timeZone)) return null
  const ended = outcomes.some((o) => ENDED.has(o.type) && ms(o.at) > ms(latest.at))
  return ended ? null : { state: 'prompt', outcomeId: latest.id, kind: latest.type }
}

/**
 * The agent's time only when positively known: an email tied to this
 * application carries exactly that time from its calendar invite. Without
 * that proof — no mail rows (agent off), no `event_at` (an older satellite),
 * or a different time — provenance is unknown, never assumed to be the user's.
 */
function fromInvite(scheduledAt: string, byId: Map<string, MailThreadItem>): boolean {
  for (const m of byId.values()) {
    if (m.eventAt && sameTime(m.eventAt, scheduledAt)) return true
  }
  return false
}
