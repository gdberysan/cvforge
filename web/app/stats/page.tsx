'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { StatsView } from '@/components/pages/StatsView'
import { GoTo } from '@/web/lib/go-home'
import { useLoader } from '@/web/lib/use-loader'

export default function Page() {
  const t = useT()
  const data = useLoader('stats')
  const shell = useLoader('shell')
  if (!data || !shell) return null
  // Nothing set up yet: the first run is the one thing to do.
  if (!shell.started) return <GoTo href="/" />
  return <StatsView data={data} t={t} />
}
