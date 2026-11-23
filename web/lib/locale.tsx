'use client'

/**
 * A static site has no cookie to read before the first paint: the language
 * is the one the person chose here before (localStorage), else the
 * browser's, else Spanish — the product's first language.
 */
import { useEffect, useState } from 'react'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { isLocale, LOCALE_COOKIE, type Locale } from '@/lib/i18n'
import { onDataChanged, workerApi } from './actions-client'

const KEY = 'cvforge-locale'

export function chosenLocale(): Locale {
  // The shared language switch writes the desktop's cookie; honour it first.
  const cookie = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`))?.[1]
  if (cookie && isLocale(cookie)) return cookie
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && isLocale(saved)) return saved
  } catch {
    // storage blocked: fall through to the browser's language
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es'
}

export function WebLocale({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('es')
  useEffect(() => {
    const apply = () => {
      const l = chosenLocale()
      setLocale(l)
      document.documentElement.lang = l
      workerApi().then((api) => api.setLocale(l))
    }
    apply()
    return onDataChanged(apply)
  }, [])
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>
}
