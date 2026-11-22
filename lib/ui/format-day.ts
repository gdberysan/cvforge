import { storedMs } from '@/lib/time'

/**
 * A day as people read it ("15 oct 2026"). SQLite's `datetime('now')` is UTC
 * without saying so ("2026-08-28 22:14:50"): read as local time, an evening
 * analysis in Mexico showed the next day. A bare "YYYY-MM-DD" (a backup's
 * file name) is a calendar day and is printed as that day everywhere.
 */
export function formatDay(value: string, locale: string, timeZone?: string): string {
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const ms = calendarDay ? Date.parse(`${value}T12:00:00Z`) : storedMs(value)
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: calendarDay ? 'UTC' : timeZone,
  })
    .format(new Date(ms))
    .replace(/\./g, '')
}
