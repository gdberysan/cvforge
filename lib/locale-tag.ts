import type { Locale } from '@/lib/i18n'

/** The BCP 47 tag the Intl formatters use for each UI locale. */
export function localeTag(locale: Locale): 'es-MX' | 'en-US' {
  return locale === 'es' ? 'es-MX' : 'en-US'
}
