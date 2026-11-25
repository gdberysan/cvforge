'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { HomeView } from '@/components/pages/HomeView'
import { BackupNudge } from '@/web/lib/backup-nudge'
import { TrialCard } from '@/web/lib/trial-card'
import { useLoader } from '@/web/lib/use-loader'
import { WaysInCard } from '@/web/lib/ways-in'

/** The home screen (components/pages/HomeView.tsx) on this browser's data. */
function Home() {
  const t = useT()
  const locale = useLocale()
  const params = useSearchParams()
  const data = useLoader('home')
  const settings = useLoader('settings')
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
      landingHref="/?inicio"
      extras={
        <>
          <BackupNudge appCount={data.kind === 'home' ? data.appCount : 0} />
          <WaysInCard />
        </>
      }
      // A used-up trial is not offered again: the key screen as it always was.
      trial={settings?.trialEnded ? undefined : <TrialCard />}
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
