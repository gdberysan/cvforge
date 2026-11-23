'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { CvsView } from '@/components/pages/SmallViews'
import { GoTo } from '@/web/lib/go-home'
import { useLoader } from '@/web/lib/use-loader'

export default function Page() {
  const t = useT()
  const data = useLoader('cvs')
  if (data === undefined) return null
  if (data === null) return <GoTo href="/" />
  return <CvsView data={data} t={t} />
}
