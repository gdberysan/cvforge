import type { CVContent } from '@/lib/schemas'

export type RenderLanguage = 'en' | 'es-MX'

export const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  'es-MX': ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
} as const

/**
 * "2016-01" -> "Jan 2016" / "ene 2016". A date the formatter cannot read
 * renders as-is — this document must never say "undefined". The schema now
 * rejects malformed dates at compose time; this fallback covers documents
 * stored before it did.
 *
 * Shared by every render target. The preview, the DOCX and the clipboard
 * text once printed three different formats for the same CV.
 */
export function formatDate(value: string, language: RenderLanguage): string {
  const match = value.match(/^(\d{4})-(\d{2})$/)
  if (!match) return value
  const name = MONTHS[language][Number(match[2]) - 1]
  return name ? `${name} ${match[1]}` : value
}

/** "Degree — Institution", or whichever half exists; never a dangling dash. */
export function educationLine(ed: CVContent['education'][number]): string {
  return [ed.degree, ed.institution].filter(Boolean).join(' — ')
}
