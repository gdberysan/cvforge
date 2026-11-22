'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { StatsView } from '@/components/pages/StatsView'
import { useLoader } from '@/web/lib/use-loader'

export default function Page() {
  const t = useT()
  const data = useLoader('stats')
  if (!data) return null
  return <StatsView data={data} t={t} />
}
