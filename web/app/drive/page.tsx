'use client'

import { useEffect } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { receiveReturn } from '@/web/lib/drive'

/**
 * Where Google sends the tab back (web/lib/drive.ts). It checks the answer
 * against the request this tab made, keeps the short-lived token for this
 * tab only, wipes it from the address bar, and returns where the person was.
 */
export default function DriveReturn() {
  const t = useT()
  useEffect(() => {
    const r = receiveReturn(window.location.hash)
    window.location.replace(r.returnTo)
  }, [])
  return (
    <main id="main" className="page">
      <p>{t('drive.return.done')}</p>
    </main>
  )
}
