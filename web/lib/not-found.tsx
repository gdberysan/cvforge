'use client'

import { useT } from '@/components/i18n/LocaleProvider'

/** What a dynamic screen shows when its id is not (or no longer) in this browser's data. */
export function NotInData() {
  const t = useT()
  return (
    <main id="main" className="page">
      <p className="prose">{t('web.notFound')}</p>
    </main>
  )
}
