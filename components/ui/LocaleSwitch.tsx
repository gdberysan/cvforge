'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/lib/i18n'

const LABEL: Record<Locale, string> = { en: 'en', es: 'es' }

/**
 * Two words, not a dropdown. There are two languages and both fit, so a menu
 * would be a control you have to open before you can read your options.
 */
export function LocaleSwitch() {
  const current = useLocale()
  const t = useT()
  const router = useRouter()
  const [, start] = useTransition()

  function choose(next: Locale) {
    if (next === current) return
    // A year, path-wide: the choice should survive closing the tab.
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is still not universal, and a same-site preference cookie is the textbook case for document.cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    start(() => router.refresh())
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: role="group" with a label is the right semantics; a fieldset exists for form inputs and would need its browser chrome reset for no reader benefit
    <div role="group" aria-label={t('nav.language')} className="locale-toggle">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          aria-current={locale === current ? 'true' : undefined}
          className="locale-option"
        >
          {LABEL[locale]}
        </button>
      ))}
    </div>
  )
}
