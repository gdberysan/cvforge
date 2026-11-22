'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { PipelineView } from '@/components/pages/PipelineView'
import { useLoader } from '@/web/lib/use-loader'

function Pipeline() {
  const t = useT()
  const params = useSearchParams()
  const data = useLoader('pipeline', {
    search: {
      show: params.get('show') ?? undefined,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
    },
  })
  if (!data) return null
  return <PipelineView data={data} t={t} />
}

export default function Page() {
  return (
    <Suspense>
      <Pipeline />
    </Suspense>
  )
}
