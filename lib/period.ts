/**
 * A role's or project's dates as a person reads them: "ene 2026 – ago 2026",
 * not the stored "2026-01 – 2026-08". A bare year stays a year; anything
 * unreadable is shown as stored rather than guessed.
 */
export function monthYear(value: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(value)
  if (!m) return value
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15))
  return new Intl.DateTimeFormat(locale === 'es' || locale.startsWith('es') ? 'es-MX' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '')
}

export function periodLabel(
  start: string,
  end: string | null | undefined,
  locale: string,
  present: string,
): string {
  return `${monthYear(start, locale)} – ${end ? monthYear(end, locale) : present}`
}
