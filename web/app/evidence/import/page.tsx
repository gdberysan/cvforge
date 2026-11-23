'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { ImportView } from '@/components/pages/SmallViews'
import { useLoader } from '@/web/lib/use-loader'

export default function Page() {
  const t = useT()
  const data = useLoader('import')
  if (!data) return null
  return <ImportView data={data} t={t} />
}
