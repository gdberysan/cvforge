import { headers } from 'next/headers'
import { isDiscoverEnabled } from '#discover'
import { DemoBanner } from '@/components/demo/DemoBanner'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { BottomNav } from '@/components/ui/BottomNav'
import { HapticsListener } from '@/components/ui/HapticsListener'
import { MomentHost } from '@/components/ui/MomentHost'
import { Nav } from '@/components/ui/Nav'
import { ToastHost } from '@/components/ui/ToastHost'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { spendSummary } from '@/lib/db/queries/spend'
import { isDemo } from '@/lib/demo/mode'
import { doorOf, tailnetConfig } from '@/lib/http/doors'
import { makeTranslate } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n/server'
import { updateAvailable } from '@/lib/update'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  // Before there is a profile there is nothing to navigate to — both links
  // lead to empty screens. A first run should be one box and nothing else.
  const started = Boolean(getProfile(db))
  // Quitting stops the server for every device; only the Mac may (mac-only).
  const canQuit = doorOf(await headers(), tailnetConfig()) === 'local'

  return (
    <LocaleProvider locale={locale}>
      {/* First tab stop: past the nav, straight to the page. */}
      <a href="#main" className="skip-link">
        {makeTranslate(locale)('nav.skip')}
      </a>
      <Nav
        started={started}
        spendUsd={spendSummary(db).totalUsd}
        demo={isDemo()}
        updateTo={isDemo() ? null : updateAvailable()}
        discover={isDiscoverEnabled()}
        canQuit={canQuit}
      />
      {isDemo() && <DemoBanner />}
      {children}
      <BottomNav started={started} />
      <ToastHost />
      <MomentHost />
      <HapticsListener />
    </LocaleProvider>
  )
}
