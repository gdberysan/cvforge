'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { HomeView } from '@/components/pages/HomeView'
import { useLoader } from '@/web/lib/use-loader'

/** The home screen (components/pages/HomeView.tsx) on this browser's data. */
function Home() {
  const t = useT()
  const locale = useLocale()
  const params = useSearchParams()
  const data = useLoader('home')
  if (!data) return null
  return (
    <HomeView
      data={data}
      t={t}
      locale={locale}
      search={{
        sample: params.get('sample') ?? undefined,
        li: params.get('li') ?? undefined,
        find: params.get('find') ?? undefined,
      }}
      discover={false}
      shotsHref="/share"
      privacyHref="/privacidad"
    />
  )
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}
