import Link from 'next/link'
import { FirstRun, WelcomeSteps } from '@/components/onboarding/FirstRun'
import { AgentFinds } from '@/components/today/AgentFinds'
import { MailSuggestions } from '@/components/today/MailSuggestions'
import { type InboxItem, TodayInbox } from '@/components/today/TodayInbox'
import { LinkedInIntake } from '@/components/triage/LinkedInIntake'
import { TriageConsole } from '@/components/triage/TriageConsole'
import { ATTENTION_STEP, attentionWhy } from '@/lib/attention-copy'
import { type Locale, plural, type Translate } from '@/lib/i18n'
import { defaultMarket } from '@/lib/markets'
import { SAMPLE_POSTING, SAMPLE_POSTING_MARKET } from '@/lib/onboarding/sample-posting'
import type { HomeData } from '@/lib/pages/home'
import { greetingKey, todaySentence } from '@/lib/today-sentence'

export type HomeSearch = { sample?: string; li?: string; find?: string }

/**
 * One box, and what you paste into it is the only thing that changes.
 *
 * Before CVForge knows you, that is your CV. After, it is a job posting. Both
 * are the same gesture — paste, read, decide — so they are the same screen
 * rather than two destinations you have to choose between. Everything else in
 * the app is somewhere you go *from* an answer, never before one.
 *
 * Renders only what lib/pages/home.ts loaded, so the desktop page and the
 * browser edition show the same screen. The clock is the renderer's: the
 * Mac's on the desktop, the browser's on the web — the person's either way.
 */
export function HomeView({
  data,
  t,
  locale,
  search,
  discover,
  keyLocal = true,
  shotsHref,
  privacyHref,
  landingHref,
  extras,
}: {
  data: HomeData
  t: Translate
  locale: Locale
  search: HomeSearch
  /** Personal desktop builds only: a discover pick arrives as ?li=<id>. */
  discover: boolean
  /** The key form is offered on the device that keeps the key. */
  keyLocal?: boolean
  /** The web edition reads screenshots: where its upload lives. */
  shotsHref?: string
  /** Where the privacy promises are written down (the web edition's page). */
  privacyHref?: string
  /** The web edition's landing page, which already shows the example. */
  landingHref?: string
  /** The web edition's own cards for the side column (ways to bring jobs in). */
  extras?: React.ReactNode
}) {
  if (data.kind === 'first-run')
    return (
      <FirstRun
        needsKey={data.needsKey}
        local={keyLocal}
        privacyHref={privacyHref}
        landingHref={landingHref}
      />
    )
  const { sample, li, find } = search
  const useSample = sample === '1'

  // Discover handoff (spec 2026-08-26): a picked result arrives as ?li=<id>.
  // The posting is read by the page once it is on screen (LinkedInIntake),
  // never by this render: a prefetch must not make the Mac fetch LinkedIn.
  const handoff = li && discover ? li : null

  const mailSection =
    data.mail.cards.length > 0 ? (
      <MailSuggestions cards={data.mail.cards} waiting={data.mail.waiting} />
    ) : null

  const today = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  const hour = new Date().getHours()
  const greeting = data.firstName
    ? t('greet.hello', { name: data.firstName })
    : t(greetingKey(hour))
  const sentence =
    data.appCount === 0
      ? t('start.tryLede')
      : data.needs.length > 0
        ? todaySentence(t, locale, { needs: data.needs.length, waiting: data.waitingCount })
        : t('home.ask')

  const inboxItems: InboxItem[] = data.needs.map(({ item, title, company }) => ({
    id: item.id,
    title,
    company,
    // The shared line for stale ends in a colon that introduced the
    // outcome buttons; on Today those buttons live on the application.
    // A stale one shows its days as a tile; the line then just says why.
    why:
      item.reason === 'stale'
        ? t(item.daysSinceApplied === 1 ? 'todayWhy.staleShort.one' : 'todayWhy.staleShort.other')
        : item.reason === 'unsent'
          ? t('todayWhy.unsent')
          : attentionWhy(t, item),
    age:
      item.reason === 'stale' && item.daysSinceApplied !== undefined
        ? item.daysSinceApplied
        : undefined,
    href: `/application/${item.id}?step=${ATTENTION_STEP[item.reason]}`,
    action: t(`todayAction.${item.reason}`),
    reason: item.reason,
  }))

  // One column, in the order of the mockup (friendly redesign 2026-11-21):
  // a greeting, the one box, then what is waiting on you. The response rate
  // lives in Números and the strength in Mi experiencia.
  return (
    <main id="main" tabIndex={-1} className="page today">
      {data.appCount === 0 && <WelcomeSteps at={3} label={t('start.tryEyebrow')} />}
      <header className="today-head">
        <p className="today-date">{today}</p>
        <h1 className="today-greet">{greeting}</h1>
        <p className="today-sentence">{sentence}</p>
      </header>

      {/* One column on a phone; on a wide screen the box and what is
          waiting sit side by side. */}
      <div className="today-cols">
        <section className="today-intake" aria-labelledby="h-intake">
          {/* Both columns open with the same header row, so their cards start
            on the same line. */}
          <div className="today-section-head">
            <h2 id="h-intake">{t('triage.cardTitle')}</h2>
          </div>
          {handoff ? (
            <LinkedInIntake
              key={handoff}
              jobId={handoff}
              compact={data.appCount > 0}
              fallbackMarket={defaultMarket(data.markets)}
              ownMarkets={data.markets}
            />
          ) : (
            <TriageConsole
              // Search-param-only navigations keep page state, so "/?sample=1"
              // from "/" would otherwise leave the box exactly as it was.
              key={useSample ? 'sample' : (li ?? 'blank')}
              compact={data.appCount > 0 && !useSample}
              defaultMarket={useSample ? SAMPLE_POSTING_MARKET : defaultMarket(data.markets)}
              ownMarkets={data.markets}
              initialText={useSample ? SAMPLE_POSTING : ''}
              demoPostings={data.demo?.postings}
              footer={
                <>
                  {useSample && <p className="intake-note">{t('home.sampleLoaded')}</p>}
                  {shotsHref ? (
                    <p className="intake-hint only-touch">{t('today.shotsHint')}</p>
                  ) : null}
                  {!useSample && !data.demo && (
                    <Link href="/?sample=1" className="action intake-sample-link">
                      {t('home.sample')}
                    </Link>
                  )}
                </>
              }
              secondary={
                shotsHref ? (
                  <Link href={shotsHref} className="btn btn-quiet">
                    {t('triage.shots')}
                  </Link>
                ) : undefined
              }
            />
          )}
        </section>

        <div className="today-side">
          {mailSection}
          {extras}

          {inboxItems.length > 0 && (
            <section className="today-section">
              <div className="today-section-head">
                <h2>{t('today.waitingTitle')}</h2>
                <Link href="/pipeline" className="action">
                  {t('today.seeAll')}
                </Link>
              </div>
              <TodayInbox items={inboxItems} />
            </section>
          )}

          {inboxItems.length === 0 && data.appCount > 0 && (
            <p className="today-all">
              <Link href="/pipeline" className="action">
                {t('today.allApplications')}
              </Link>
            </p>
          )}

          {/* Personal builds only: what the job agent found, folded away so the
          box stays the first thing on the page. */}
          {data.finds.length > 0 && (
            <details className="today-finds" open={Boolean(find)}>
              <summary>{plural(t, data.finds.length, 'today.findsSummary')}</summary>
              <AgentFinds finds={data.finds} highlight={find ?? null} />
            </details>
          )}
        </div>
      </div>
    </main>
  )
}

export { WelcomeSteps }
