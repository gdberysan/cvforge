import { redirect } from 'next/navigation'
import { LinkedInIntake } from '@/components/triage/LinkedInIntake'
import { TriageConsole } from '@/components/triage/TriageConsole'
import { BackLink } from '@/components/ui/BackLink'
import { db } from '@/lib/db/client'
import { listApplicationLinks } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { linkedInJobId, marketFromLocation } from '@/lib/discover/annotate'
import { getTranslate } from '@/lib/i18n/server'
import { effectiveMarkets } from '@/lib/markets'
import { resolveShared } from '@/lib/share/resolve'

export const dynamic = 'force-dynamic'

/**
 * Android's share menu lands here (manifest share_target, GET). A posting
 * already analysed opens its application at no cost; a LinkedIn link is read
 * on the Mac — by the page once it is on screen, never by this render, so a
 * link preview or a prefetch cannot make the Mac fetch from LinkedIn;
 * selected text is the posting; anything else is the paste box with the link
 * kept. Nothing is analysed until the person taps Analyse, so the market can
 * be corrected first and sharing alone never spends.
 */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>
}) {
  const { t } = await getTranslate()
  const params = await searchParams
  const shared = resolveShared(params)
  // Opened from the bottom bar it is a place to start; from a share, it is
  // about the posting that just arrived.
  const fromShare = Boolean(params.text || params.url || params.title)
  const owner = getProfile(db)
  const markets = owner ? effectiveMarkets(owner.preferences.markets, owner.basics.location) : []

  if (shared.kind === 'linkedin') {
    const existing = listApplicationLinks(db).find(
      (a) => linkedInJobId(a.sourceUrl) === shared.jobId,
    )
    if (existing) redirect(`/application/${existing.id}`)
  }

  return (
    <main id="main" tabIndex={-1} className="page share-page">
      <BackLink href="/" label={t('nav.today')} />
      <header className="page-head">
        <p className="eyebrow">{t('share.eyebrow')}</p>
        <h1 className="share-title">{t(fromShare ? 'share.titleShared' : 'share.title')}</h1>
      </header>
      {shared.kind === 'linkedin' ? (
        <LinkedInIntake
          jobId={shared.jobId}
          fallbackMarket={marketFromLocation(null, markets)}
          ownMarkets={markets}
        />
      ) : (
        <TriageConsole
          defaultMarket={marketFromLocation(null, markets)}
          ownMarkets={markets}
          initialText={shared.kind === 'text' ? shared.text : ''}
          initialSourceUrl={shared.url}
        />
      )}
    </main>
  )
}
