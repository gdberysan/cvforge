'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/theme'

/** Three choices, all visible: the system's setting, or a fixed one. */
export function ThemeSwitch({ current }: { current: Theme }) {
  const t = useT()
  const router = useRouter()
  const [theme, setTheme] = useState(current)
  const [, start] = useTransition()

  function choose(next: Theme) {
    setTheme(next)
    // Applied at once on the client, then confirmed by a server render that
    // reads the cookie — so the very next page load paints in it too.
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
    // biome-ignore lint/suspicious/noDocumentCookie: same reasoning as the language switch — a same-site preference cookie
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    start(() => router.refresh())
  }

  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}>
      <p className="fact-label" id="theme-label">
        {t('settings.theme.title')}
      </p>
      <div
        role="radiogroup"
        aria-labelledby="theme-label"
        className="queue-filters"
        style={{ marginTop: 0 }}
      >
        {THEMES.map((option) => (
          // biome-ignore lint/a11y/useSemanticElements: styled as the app's chip toggles; role="radio" with aria-checked in a radiogroup is the ARIA radio pattern
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={theme === option}
            className="chip-toggle"
            onClick={() => choose(option)}
          >
            {t(`settings.theme.${option}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
