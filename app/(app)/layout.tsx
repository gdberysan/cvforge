import { DemoBanner } from '@/components/demo/DemoBanner'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { Nav } from '@/components/ui/Nav'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { spendSummary } from '@/lib/db/queries/spend'
import { isDemo } from '@/lib/demo/mode'
import { getLocale } from '@/lib/i18n/server'
import { updateAvailable } from '@/lib/update'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  // Before there is a profile there is nothing to navigate to — both links
  // lead to empty screens. A first run should be one box and nothing else.
  const started = Boolean(getProfile(db))

  return (
    <LocaleProvider locale={locale}>
      <Nav
        started={started}
        spendUsd={spendSummary(db).totalUsd}
        demo={isDemo()}
        updateTo={isDemo() ? null : updateAvailable()}
      />
      {isDemo() && <DemoBanner />}
      {children}
    </LocaleProvider>
  )
}
