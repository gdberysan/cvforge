import { cookies } from 'next/headers'
import { makeTranslate, type Translate } from './index'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './locale'

/**
 * A cookie rather than a profile field: the very first screen — paste your CV —
 * exists before there is a profile to hold a preference, and that is exactly
 * the screen a Spanish speaker needs in Spanish.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getTranslate(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale()
  return { locale, t: makeTranslate(locale) }
}
