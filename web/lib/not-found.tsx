'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n/LocaleProvider'

/** What a dynamic screen shows when its id is not (or no longer) in this browser's data. */
export function NotInData() {
  const t = useT()
  return (
    <main id="main" className="page page-narrow">
      <header className="page-head">
        <p className="eyebrow">{t('notFound.eyebrow')}</p>
        <h1 className="page-title">{t('notFound.title')}</h1>
        <p className="page-lede">{t('web.notFound')}</p>
      </header>
      <div className="page-actions">
        <Link href="/" className="btn btn-primary">
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  )
}
