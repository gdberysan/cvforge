import { isDiscoverEnabled } from '#discover'
import { HomeView } from '@/components/pages/HomeView'
import type { FindCard } from '@/components/today/AgentFinds'
import type { MailCard } from '@/components/today/MailSuggestions'
import { findPreview } from '@/lib/agent/find-preview'
import { listPendingFinds } from '@/lib/agent/finds'
import { db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { loadHome } from '@/lib/pages/home'
import { safeHttpUrl } from '@/lib/posting-source'
import { roleSummary } from '@/lib/role-summary'
import { listMailSuggestions } from '@/lib/satellite/mail'
import { isAgentAvailable } from '@/lib/satellite/settings'
import { satelliteDbPath } from '@/lib/settings'

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

/**
 * Emails the agent could not place (personal builds with the satellite only).
 * A candidate id that is no longer a waiting application is dropped; with none
 * left the card offers the whole list.
 */
function mailSuggestions(waiting: { id: string; label: string }[]): MailCard[] {
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return []
  const byId = new Map(waiting.map((w) => [w.id, w]))
  return listMailSuggestions(file).map((s) => ({
    id: s.id,
    at: s.at,
    from: s.from,
    subject: s.subject,
    quote: s.quote,
    candidates: s.candidateAppIds.flatMap((id) => byId.get(id) ?? []),
  }))
}

/**
 * The job agent's pending finds (personal builds with the satellite only),
 * shaped for the card and its preview sheet. The counts are the mandatory
 * requirements, the same ones the verdict rests on. The sheet gets only what
 * it prints — `findPreview`'s grouped keywords and the posting's own
 * summary — never the stored analysis itself.
 */
function agentFinds(): FindCard[] {
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return []
  return listPendingFinds(file, { maxAgeDays: 7 }).map(({ postingId, createdAt, analysis: a }) => ({
    postingId,
    createdAt,
    jobTitle: a.jobTitle,
    company: a.company.trim(),
    source: a.source,
    verdict: a.coverage.verdict,
    ...findPreview(a),
    summary: roleSummary(a.postingRaw, a.company),
    summaryLang: a.documentLanguage,
    postingRaw: a.postingRaw,
    sourceUrl: safeHttpUrl(a.sourceUrl),
  }))
}
