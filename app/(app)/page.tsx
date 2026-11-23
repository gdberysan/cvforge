import { isDiscoverEnabled } from '#discover'
import { agentFinds, mailSuggestions } from '#satellite'
import { HomeView } from '@/components/pages/HomeView'
import { db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { loadHome } from '@/lib/pages/home'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran — on the
 * home page that means shipping the first-run import screen to someone who
 * already has a profile.
 */
export const dynamic = 'force-dynamic'

/** The home screen (components/pages/HomeView.tsx) on the desktop's own data. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sample?: string; li?: string; find?: string }>
}) {
  const { t, locale } = await getTranslate()
  const data = loadHome(db, {
    now: new Date().toISOString(),
    demo: isDemo(),
    agent: { finds: agentFinds, mail: mailSuggestions },
  })
  return (
    <HomeView
      data={data}
      t={t}
      locale={locale}
      search={await searchParams}
      discover={isDiscoverEnabled()}
    />
  )
}
