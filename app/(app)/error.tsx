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
      <p className="eyebrow">{t('errorPage.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
        {t('errorPage.title')}
      </h1>
      <p
        style={{
          color: 'var(--text-muted)',
          marginTop: 'var(--space-4)',
          maxWidth: '36em',
          lineHeight: 'var(--leading-relaxed)',
        }}
      >
        {t('errorPage.lede')}
      </p>
      {error.digest && (
        <p className="fact" style={{ marginTop: 'var(--space-3)', color: 'var(--text-faint)' }}>
          {error.digest}
        </p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
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
