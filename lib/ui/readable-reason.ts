/**
 * A checker's reason, made readable for display. The distortion check
 * writes machine-ish prose — ISO month ranges in brackets, straight quotes,
 * "~3.6" — and the person reads it next to the claim under review. Only
 * the presentation changes: no word, figure or date is altered or dropped.
 */
export function readableReason(text: string, locale: 'en' | 'es'): string {
  const tag = locale === 'es' ? 'es-MX' : 'en-US'
  const month = new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const ym = (y: string, m: string) => {
    const n = Number(m)
    if (n < 1 || n > 12) return `${y}-${m}`
    return month.format(new Date(Date.UTC(Number(y), n - 1, 15))).replace('.', '')
  }
  let out = text
    // [2014-07–2016-02] or 2014-07 – 2016-02 → jul 2014 – feb 2016
    .replace(
      /\[?\b(\d{4})-(\d{2})\s*[–—-]\s*(\d{4})-(\d{2})\b\]?/g,
      (_, y1, m1, y2, m2) => `${ym(y1, m1)} – ${ym(y2, m2)}`,
    )
    // a lone 2023-08 (not part of a full date)
    .replace(/\b(\d{4})-(\d{2})\b(?!-\d)/g, (_, y, m) => ym(y, m))
    // straight quotes → « »
    .replace(/"([^"\n]+)"/g, '«$1»')
    .replace(/(^|[\s(])'([^'\n]+)'(?=[\s.,;:)]|$)/g, '$1«$2»')
    // ~3.6 → about 3.6 / unos 3,6
    .replace(/~\s?(\d+)(?:\.(\d+))?/g, (_, a, b) =>
      locale === 'es' ? `unos ${a}${b ? `,${b}` : ''}` : `about ${a}${b ? `.${b}` : ''}`,
    )
    .trim()
  if (out && !/[.!?»)]$/.test(out)) out += '.'
  return out
}

/** The opening of a line, cut at a word, for naming which line a flag is about. */
export function openingWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}
