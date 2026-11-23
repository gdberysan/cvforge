import { BRAND } from '@/lib/brand'
import { dictionary, type MessageKey } from './dictionary'
import { DEFAULT_LOCALE, type Locale } from './locale'

export type { MessageKey } from './dictionary'
export { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, type Locale } from './locale'

export type Params = Record<string, string | number>

/** `t` bound to one locale. Components take this rather than a locale string. */
export type Translate = (key: MessageKey, params?: Params) => string

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const table = dictionary[locale] ?? dictionary[DEFAULT_LOCALE]
  return fillMessage(table[key] ?? dictionary[DEFAULT_LOCALE][key] ?? key, params)
}

/** A dictionary string as shown: the build's product name, then the {params}. */
export function fillMessage(found: string, params?: Params): string {
  // The dictionary names the product CVForge; a build under another name says that one.
  const raw = BRAND === 'CVForge' ? found : found.replaceAll('CVForge', BRAND)
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

export function makeTranslate(locale: Locale): Translate {
  return (key, params) => translate(locale, key, params)
}

/**
 * Spanish and English agree on where the plural boundary sits (one vs. not
 * one), so one helper covers both. Zero takes the plural form in both.
 */
export function plural(t: Translate, count: number, base: string, params?: Params): string {
  const key = `${base}.${count === 1 ? 'one' : 'other'}` as MessageKey
  return t(key, { n: count, ...params })
}

/**
 * Server errors travel as machine codes plus an English fallback message.
 * A known code renders in the active locale; anything else shows the server's
 * own words rather than a raw code — an untranslated error still beats an
 * uninformative one.
 */
export function errorText(t: Translate, code: string | undefined, fallback: string): string {
  if (!code) return fallback
  const key = `error.${code}` as MessageKey
  const text = t(key)
  return text === key ? fallback : text
}
