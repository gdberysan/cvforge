'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { PipelineView } from '@/components/pages/PipelineView'
import { GoTo } from '@/web/lib/go-home'
import { useLoader } from '@/web/lib/use-loader'

function Pipeline() {
  const t = useT()
  const params = useSearchParams()
  const shell = useLoader('shell')
  const data = useLoader('pipeline', {
    search: {
      show: params.get('show') ?? undefined,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
    },
  })
  if (!data || !shell) return null
  // Nothing set up yet: an empty list with a box that cannot work is a dead
  // end; the first run is the one thing to do.
  if (!shell.started) return <GoTo href="/" />
  return <PipelineView data={data} t={t} />
}

export default function Page() {
  return (
    <Suspense>
      <Pipeline />
    </Suspense>
  )
}
