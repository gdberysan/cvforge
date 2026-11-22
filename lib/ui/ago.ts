/**
 * "hace 40 min" / "40 min. ago": how long since something happened, in the
 * reader's language, coarse on purpose. A time in the future (a clock a
 * little ahead) reads as now, never "in 2 min".
 */
export function ago(iso: string, locale: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    numeric: 'auto',
    style: 'short',
  })
  if (seconds < 60) return rtf.format(0, 'second')
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), 'hour')
  return rtf.format(-Math.floor(seconds / 86_400), 'day')
}
