'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { GapsView } from '@/components/pages/SmallViews'
import { GoTo } from '@/web/lib/go-home'
import { NotInData } from '@/web/lib/not-found'
import { useRouteId } from '@/web/lib/route-id'
import { useLoader } from '@/web/lib/use-loader'

function Gaps({ id }: { id: string }) {
  const t = useT()
  const data = useLoader('gaps', { id })
  if (data === undefined) return null
  if (data === null) return <NotInData />
  // Nothing left to write against: on to where the application is.
  if (data.redirect !== null) return <GoTo href={data.redirect} />
  return <GapsView data={data} t={t} />
}

export function GapsScreen() {
  const id = useRouteId('/application/')
  return id ? <Gaps key={id} id={id} /> : null
}
