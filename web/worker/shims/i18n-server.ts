// lib/i18n/server inside the Worker: no cookie; the page tells the Worker the
// person's language when it opens the database and whenever it changes.
import { makeTranslate, type Translate } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/locale'

let current: Locale = 'es'

export function setWorkerLocale(locale: Locale): void {
  current = locale
}

export async function getLocale(): Promise<Locale> {
  return current
}

export async function getTranslate(): Promise<{ locale: Locale; t: Translate }> {
  return { locale: current, t: makeTranslate(current) }
}
