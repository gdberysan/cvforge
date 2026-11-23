import Link from 'next/link'
import { getTranslate } from '@/lib/i18n/server'

/** Rendered by notFound() calls — a stale application or role link. */
export default async function NotFound() {
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
