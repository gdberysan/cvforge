import { type Locale, type MessageKey, plural, type Translate } from '@/lib/i18n'
import { localeTag } from '@/lib/locale-tag'

/**
 * One wording for a scheduled interview or screen call, wherever it shows —
 * the overview's status, the Postulaciones card and Seguimiento's interview
 * card: "Entrevista · mar 20 oct · en 3 días", "Llamada · vie 16 oct · hoy".
 * Pure and label-only (no clock, no zone): the callers hand in the call's
 * own local calendar day and how many days away it is, as Seguimiento's
 * interview card (lib/mail-thread) already computed them.
 */

export type CallKind = 'interview' | 'screen'

/**
 * "mar 20 oct" / "Tue, Oct 20": the call's own calendar day, as stored.
 * Picked from parts: es-MX alone would print "mar, 20 de oct.".
 */
export function callDayLabel(
  d: { year: number; month: number; day: number },
  locale: Locale,
): string {
  const parts = new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(d.year, d.month - 1, d.day)))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '')
  return locale === 'es'
    ? `${part('weekday')} ${part('day')} ${part('month')}`
    : `${part('weekday')}, ${part('month')} ${part('day')}`
}

/** "hoy", "mañana", "en 3 días"; for a past call "ayer", "hace 3 días". */
export function callWhen(t: Translate, daysFromToday: number): string {
  if (daysFromToday === 0) return t('call.today')
  if (daysFromToday === 1) return t('call.tomorrow')
  if (daysFromToday === -1) return t('call.yesterday')
  return daysFromToday > 0
    ? plural(t, daysFromToday, 'call.inDays')
    : plural(t, -daysFromToday, 'call.daysAgo')
}

/** "Entrevista · mar 20 oct · en 3 días". */
export function callLine(
  t: Translate,
  c: { kind: CallKind; dayLabel: string; daysFromToday: number },
): string {
  return t('call.line', {
    kind: t(`call.kind.${c.kind}`),
    date: c.dayLabel,
    when: callWhen(t, c.daysFromToday),
  })
}

/**
 * A call whose day is today or still ahead: news to prepare for, not a
 * question to answer. Takes Seguimiento's card or its view alike.
 */
export function isCallAhead(
  call: { state: 'scheduled'; daysFromToday: number } | { state: 'prompt' } | null,
): boolean {
  return call?.state === 'scheduled' && call.daysFromToday >= 0
}

/**
 * Seguimiento's question over the outcome grid — the same rule as the
 * Postulaciones card: before sending, "¿Ya la enviaste?"; while a call is
 * still ahead, a neutral "Registrar un resultado" (nothing has happened yet
 * to ask about); otherwise "¿Qué pasó?".
 */
export function trackAskKey(
  actionCount: number,
  call: Parameters<typeof isCallAhead>[0],
): MessageKey {
  if (actionCount === 1) return 'track.askUnsent'
  return isCallAhead(call) ? 'track.askLater' : 'track.ask'
}
