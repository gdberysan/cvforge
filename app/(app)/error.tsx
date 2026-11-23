'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n/LocaleProvider'

/**
 * The boundary that keeps a rendering or server-action throw from replacing
 * the screen with Next's default white page. It renders inside the app shell,
 * so the nav — and the way out — stay visible.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()

  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="eyebrow">{t('errorPage.eyebrow')}</p>
        <h1 className="page-title">{t('errorPage.title')}</h1>
        <p className="page-lede">{t('errorPage.lede')}</p>
        {error.digest && <p className="page-note">{error.digest}</p>}
      </header>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t('errorPage.retry')}
        </button>
        <Link href="/" className="btn btn-quiet">
          {t('errorPage.home')}
        </Link>
      </div>
    </main>
  )
}
