import type { WorkStep } from '@/lib/application-steps'
import { callDayLabel, callLine, isCallAhead } from '@/lib/call-line'
import { type Locale, type MessageKey, plural, type Translate } from '@/lib/i18n'
import { buildThread, type InterviewCard } from '@/lib/mail-thread'
import type { ApplicationStatus, OutcomeEvent } from '@/lib/schemas'
import { dayLabel } from '@/lib/seguimiento-view'
import { latestOutcome, stagePosition } from '@/lib/stage'
import { type AttentionReason, appliedAt, respondedAt } from '@/lib/stats'
import { calendarDaysSince } from '@/lib/time'

/**
 * The overview's one line of state (spec 2026-10-17 §2): "Enviada el 7 oct ·
 * 9 días sin respuesta", "En entrevistas · mar 20 oct". Built on the server
 * from the outcome log only — every date formatted here, in the user's zone,
 * so the client never formats one (React #418). Pure: `now` and the zone
 * come in. It says only what was logged; a state the log cannot show is left
 * unsaid rather than guessed.
 */
export type OverviewStatusInput = {
  status: ApplicationStatus
  outcomes: readonly OutcomeEvent[]
  /** Seguimiento's interview card (lib/mail-thread), when one exists. */
  interview: InterviewCard | null
  hasCv: boolean
  /** The application row's `created_at` — when it was analysed. */
  createdAt: string
  locale: Locale
  timeZone: string
  now: number
}

/** A scheduled call in the shared wording (lib/call-line). */
function scheduledLine(
  t: Translate,
  card: Extract<InterviewCard, { state: 'scheduled' }>,
  locale: Locale,
): string {
  return callLine(t, {
    kind: card.kind,
    dayLabel: callDayLabel(card, locale),
    daysFromToday: card.daysFromToday,
  })
}

export { calendarDaysSince } from '@/lib/time'

const joined = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ')

/**
 * A settled application as two parts for a list that lines them up: how it
 * ended, and the day it did. Null for one still open.
 */
export function settledParts(
  t: Translate,
  i: OverviewStatusInput,
): { end: string; word: string; when: string | null; at: string | null } | null {
  if (i.status !== 'closed' && i.status !== 'offer') return null
  const day = (iso: string) => dayLabel(iso, i.locale, i.timeZone, i.now)
  const end =
    i.status === 'offer'
      ? 'offer'
      : (stagePosition('closed', latestOutcome(i.outcomes)).end ?? 'closed')
  const closing =
    end === 'closed'
      ? undefined
      : [...i.outcomes].filter((o) => o.type === end).sort((a, b) => b.at.localeCompare(a.at))[0]
  return {
    end,
    word: t(`stage.end.${end}`),
    when: closing ? day(closing.at) : null,
    at: closing?.at ?? null,
  }
}

export function overviewStatus(t: Translate, i: OverviewStatusInput): string {
  const day = (iso: string) => dayLabel(iso, i.locale, i.timeZone, i.now)
  const latest = latestOutcome(i.outcomes)
  const newestOf = (types: string[]) =>
    [...i.outcomes]
      .filter((o) => types.includes(o.type))
      .sort((a, b) => b.at.localeCompare(a.at))[0]

  switch (i.status) {
    case 'archived':
      return t('overview.status.archived')
    case 'offer': {
      const offer = newestOf(['offer'])
      return joined(t('stage.end.offer'), offer ? day(offer.at) : null)
    }
    case 'closed': {
      const end = stagePosition('closed', latest).end ?? 'closed'
      const closing = end === 'closed' ? undefined : newestOf([end])
      return joined(t(`stage.end.${end}`), closing ? day(closing.at) : null)
    }
    case 'interviewing':
    case 'applied': {
      const card = i.interview
      // An upcoming call is the news; one already past is Seguimiento's to tell.
      if (card?.state === 'scheduled' && isCallAhead(card)) {
        return scheduledLine(t, card, i.locale)
      }
      if (i.status === 'interviewing') return t('overview.status.interviewing')
      const replied = respondedAt(i)
      if (replied) return t('overview.status.replied', { date: day(replied) })
      const sent = appliedAt(i)
      if (!sent) return t('overview.status.sentNoDate')
      const days = calendarDaysSince(sent, i.now, i.timeZone)
      if (days < 1) return t('overview.status.sentToday')
      return plural(t, days, 'overview.status.sent', { date: day(sent) })
    }
    case 'triaged':
    case 'drafting':
      return i.hasCv
        ? t('overview.status.cvReady')
        : t('overview.status.analysed', { date: day(i.createdAt) })
  }
}

/**
 * The primary button's words, per the step it opens. On follow-up, an unused
 * draft the agent wrote is the concrete next move, so the button names it.
 */
export function nextMoveKey(
  step: WorkStep,
  opts: { archived: boolean; draftWaiting: boolean },
): MessageKey {
  if (step === 'decide' && opts.archived) return 'overview.next.archived'
  if (step === 'track' && opts.draftWaiting) return 'overview.next.draft'
  return `overview.next.${step}`
}

/**
 * Seguimiento's interview card from a bare outcome log, for a page that has
 * no mail to read (the Postulaciones list): the same card, so a scheduled
 * call reads the same on the card, the overview and Seguimiento.
 */
export function interviewOf(
  outcomes: readonly OutcomeEvent[],
  now: number,
  timeZone: string,
): InterviewCard | null {
  if (!outcomes.some((o) => o.type === 'interview' || o.type === 'screen')) return null
  return buildThread({
    outcomes: outcomes.map((o, i) => ({
      id: `o${i}`,
      at: o.at,
      type: o.type,
      note: o.note ?? null,
      scheduledAt: o.scheduledAt ?? null,
    })),
    mail: [],
    drafts: [],
    account: null,
    now,
    timeZone,
  }).interview
}

/** A call whose day is today or still ahead: news to prepare for, not to ask about. */
export const hasUpcomingCall = (card: InterviewCard | null): boolean => isCallAhead(card)

/**
 * The Postulaciones card's one line of state (plan 2026-10-17 Task 3), keyed
 * to where the track stands: "Entrevista · mar 20 oct · en 3 días", "Enviada hace 9
 * días, sin respuesta", "Documentos listos", "Analizada hace 3 días". Relative
 * where the overview is absolute — a list is scanned for age. Same sources as
 * `overviewStatus`, same rule: only what the log shows.
 */
export function cardStatus(t: Translate, i: OverviewStatusInput): string {
  const ago = (iso: string) => calendarDaysSince(iso, i.now, i.timeZone)
  switch (i.status) {
    case 'archived':
    case 'offer':
    case 'closed':
      return overviewStatus(t, i)
    case 'interviewing':
    case 'applied': {
      const card = i.interview
      if (card?.state === 'scheduled' && isCallAhead(card)) {
        return scheduledLine(t, card, i.locale)
      }
      if (i.status === 'interviewing') return t('overview.status.interviewing')
      const replied = respondedAt(i)
      if (replied) {
        const days = ago(replied)
        return days < 1
          ? t('pipeline.state.repliedToday')
          : plural(t, days, 'pipeline.state.replied')
      }
      const sent = appliedAt(i)
      if (!sent) return t('overview.status.sentNoDate')
      const days = ago(sent)
      return days < 1 ? t('overview.status.sentToday') : plural(t, days, 'pipeline.state.sent')
    }
    // "Documentos listos" only with a CV saved — the overview's own rule
    // (hasCv): a companion merged in after a failed CV stage is not a kit.
    case 'drafting':
      if (i.hasCv) return t('pipeline.state.documents')
      return analysedAgo()
    case 'triaged':
      return analysedAgo()
  }

  function analysedAgo(): string {
    const days = ago(i.createdAt)
    return days < 1 ? t('pipeline.state.analysedToday') : plural(t, days, 'pipeline.state.analysed')
  }
}

/**
 * An attention card's prompt: its state line, then the question the 2×2
 * grid answers — "Enviada hace 9 días, sin respuesta. ¿Qué pasó?". A call
 * still ahead is not asked about ("¿Qué pasó?" three days early): the line
 * stands alone, and the grid stays for whatever happens first.
 */
export function attentionPrompt(
  t: Translate,
  i: { state: string; reason: AttentionReason; upcoming: boolean },
): string {
  if (i.upcoming) return i.state
  const question = i.reason === 'stale' || i.reason === 'interviewing' ? 'whatHappened' : 'sent'
  return t('pipeline.ask.joined', { state: i.state, question: t(`pipeline.ask.${question}`) })
}
