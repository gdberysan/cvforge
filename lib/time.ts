/**
 * Every reading of a time in the user's zone goes through here. The copies
 * this replaced drifted apart (the v1.2.53 UTC bug was one of them), so a new
 * date or zone rule belongs in this file, not beside its caller.
 */

/** `timeZone` when the runtime knows it, else UTC: an unknown zone name must not take a page down. */
export function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

/** The server's zone — the user's own Mac, so its clock is theirs. */
export const serverTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const SQLITE_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/** Whether a stored value is a bare calendar day (`YYYY-MM-DD`), not an instant. */
export const isDateOnly = (value: string): boolean => DATE_ONLY.test(value)

/**
 * A stored time as epoch ms; NaN when it is not one. SQLite's
 * `datetime('now')` / CURRENT_TIMESTAMP is UTC without saying so
 * ("2026-08-28 22:14:50"): read as local time, an evening in Mexico City
 * lands on the next day. ISO strings carry their own offset.
 */
export function storedMs(value: string): number {
  return Date.parse(SQLITE_UTC.test(value) ? `${value.replace(' ', 'T')}Z` : value)
}

/** An instant as its wall clock in a zone. `date` is `YYYY-MM-DD`, `time` is `HH:MM`. */
export type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  date: string
  time: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  const zone = safeZone(timeZone)
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZone: zone,
    })
    formatters.set(zone, f)
  }
  return f
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The wall-clock date and time of an instant in `timeZone` (UTC when the zone is unknown). */
export function wallClock(ms: number, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const [year, month, day, hour, minute, second] = [
    get('year'),
    get('month'),
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  ]
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  }
}

/** A calendar day as a whole number, so two days subtract to the days between them. */
export const dayIndex = (d: { year: number; month: number; day: number }): number =>
  Date.UTC(d.year, d.month - 1, d.day) / 86_400_000

/** The zone's offset from UTC at `ms`, in ms (positive east of Greenwich). */
function zoneOffset(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms
}

/** Wall-clock fields; `month` is 1–12. */
export type WallFields = {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
}

/**
 * Wall-clock fields in `timeZone` → the UTC instant. Two passes settle a DST
 * edge; a fall-back hour takes its first occurrence. A wall time inside a
 * spring-forward gap does not exist and gives null, never an hour off.
 */
export function zonedToUtc(f: WallFields, timeZone: string): number | null {
  const wall = Date.UTC(f.year, f.month - 1, f.day, f.hour ?? 0, f.minute ?? 0, f.second ?? 0)
  let utc = wall - zoneOffset(wall, timeZone)
  utc = wall - zoneOffset(utc, timeZone)
  return utc + zoneOffset(utc, timeZone) === wall ? utc : null
}

/**
 * Calendar days from `fromIso` to `now` in `timeZone` — the zone Seguimiento
 * reads dates in — not elapsed 24-hour periods: sent at 22:00 and read at
 * 09:00 the next morning is one day ago, never "today".
 */
export function calendarDaysSince(fromIso: string, now: number, timeZone: string): number {
  return dayIndex(wallClock(now, timeZone)) - dayIndex(wallClock(storedMs(fromIso), timeZone))
}

/**
 * The `YYYY-MM-DD` a stored time falls on in `timeZone`: a bare date is
 * already one; an instant is read where the user is, so 19:30 in Mexico City
 * stays that day though UTC has moved on.
 */
export function localDay(iso: string, timeZone: string): string {
  if (DATE_ONLY.test(iso)) return iso
  const t = storedMs(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  return wallClock(t, timeZone).date
}

/** The last millisecond of a `YYYY-MM-DD` in `timeZone`. */
export function endOfLocalDay(date: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const midnight = Date.UTC(y, m - 1, d + 1)
  // Shift by the zone's offset, then again at the result in case a DST change sits between.
  let t = midnight - zoneOffset(midnight, timeZone)
  t = midnight - zoneOffset(t, timeZone)
  return t - 1
}
