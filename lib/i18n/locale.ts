export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * What the server renders before the user has picked a language (no cookie
 * yet): Spanish, the product's first language. A fresh browser — a buyer's
 * first launch, a new phone — used to open in English. DEFAULT_LOCALE stays
 * the dictionary's and the client context's fallback.
 */
export const FIRST_VISIT_LOCALE: Locale = 'es'

/** Read on the server to render, written by the switch in the nav. */
export const LOCALE_COOKIE = 'cvforge_locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
