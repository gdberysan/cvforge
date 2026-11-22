'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { ApplicationView } from '@/components/pages/ApplicationView'
import { NotInData } from '@/web/lib/not-found'
import { useRouteId } from '@/web/lib/route-id'
import { useLoader } from '@/web/lib/use-loader'

function Application({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const params = useSearchParams()
  const data = useLoader('application', {
    id,
    search: {
      step: params.get('step') ?? undefined,
      gapdelta: params.get('gapdelta') ?? undefined,
    },
  })
  if (data === undefined) return null
  if (data === null) return <NotInData />
  return <ApplicationView data={data} t={t} locale={locale} />
}

export function ApplicationScreen() {
  const id = useRouteId('/application/')
  return <Suspense>{id && <Application key={id} id={id} />}</Suspense>
}
