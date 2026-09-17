import Link from 'next/link'
import { getTranslate } from '@/lib/i18n/server'

/**
 * Catches URLs that match no route at all, so it renders in the root layout —
 * outside the app shell and its nav. Same copy as the in-shell 404; the link
 * home is the whole job.
 */
export default async function RootNotFound() {
  const { t } = await getTranslate()

  return (
    <main className="page page-narrow">
      <p className="eyebrow">{t('notFound.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>{t('notFound.title')}</h1>
      <p
        style={{
          color: 'var(--text-muted)',
          marginTop: 'var(--space-4)',
          maxWidth: '36em',
          lineHeight: 'var(--leading-relaxed)',
        }}
      >
        {t('notFound.lede')}
      </p>
      <Link
        href="/"
        className="btn btn-primary"
        style={{ display: 'inline-block', marginTop: 'var(--space-6)' }}
      >
        {t('notFound.home')}
      </Link>
    </main>
  )
}
