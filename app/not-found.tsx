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
      <header className="page-head">
        <p className="eyebrow">{t('notFound.eyebrow')}</p>
        <h1 className="page-title">{t('notFound.title')}</h1>
        <p className="page-lede">{t('notFound.lede')}</p>
      </header>
      <div className="page-actions">
        <Link href="/" className="btn btn-primary">
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  )
}
