'use client'

import { createContext, useContext, useMemo } from 'react'
import { DEFAULT_LOCALE, type Locale, makeTranslate, type Translate } from '@/lib/i18n'

const LocaleContext = createContext<{ locale: Locale; t: Translate }>({
  locale: DEFAULT_LOCALE,
  t: makeTranslate(DEFAULT_LOCALE),
})

/** Seeded on the server from the cookie, so the first paint is already right. */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ locale, t: makeTranslate(locale) }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useT(): Translate {
  return useContext(LocaleContext).t
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale
}
