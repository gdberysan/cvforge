import type { OutcomeType } from '@/lib/schemas'
import { endOfLocalDay, serverTimeZone } from '@/lib/time'

/** An outcome row as `listOutcomes` returns it. */
export type OutcomeRow = {
  id: string
  at: string
  type: OutcomeType
  note: string | null
  scheduledAt: string | null
  meetingUrl: string | null
}

/**
 * Which call the prep is for. `n` counts interviews (the second interview is
 * round 2); a screen is round 0. Inferred from the log alone, so a buyer
 * install with no email agent gets the same answer.
 */
export type Round = {
  kind: 'screen' | 'interview'
  n: number
  eventId: string | null
  scheduledAt: string | null
  meetingUrl: string | null
}

const isCall = (o: OutcomeRow): o is OutcomeRow & { type: 'screen' | 'interview' } =>
  o.type === 'screen' || o.type === 'interview'

/**
 * A date-only time counts as the whole day where the user is, so a call
 * today is still upcoming until their own midnight.
 */
function endOf(scheduledAt: string, timeZone: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(scheduledAt)
    ? endOfLocalDay(scheduledAt, timeZone)
    : Date.parse(scheduledAt)
}

/** The given call; else the next upcoming one; else the latest. Null when no call is logged. */
export function roundOf(
  outcomes: OutcomeRow[],
  eventId?: string,
  now: number = Date.now(),
  timeZone: string = serverTimeZone(),
): Round | null {
  const calls = outcomes.filter(isCall)
  if (calls.length === 0) return null
  const upcoming = calls
    .filter((o) => o.scheduledAt !== null && endOf(o.scheduledAt, timeZone) >= now)
    .sort((a, b) => endOf(a.scheduledAt ?? '', timeZone) - endOf(b.scheduledAt ?? '', timeZone))
  const chosen =
    (eventId ? calls.find((o) => o.id === eventId) : undefined) ?? upcoming[0] ?? calls.at(-1)
  if (!chosen) return null
  const interviews = calls.filter((o) => o.type === 'interview')
  return {
    kind: chosen.type,
    n: chosen.type === 'interview' ? interviews.indexOf(chosen) + 1 : 0,
    eventId: chosen.id,
    scheduledAt: chosen.scheduledAt,
    meetingUrl: chosen.meetingUrl,
  }
}
