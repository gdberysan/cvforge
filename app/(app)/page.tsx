import Link from 'next/link'
import { ImportReview } from '@/components/evidence/ImportReview'
import { say } from '@/components/evidence/Rail'
import { OutcomeButtons } from '@/components/pipeline/OutcomeButtons'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { KeyGuide } from '@/components/settings/KeyGuide'
import { TriageConsole } from '@/components/triage/TriageConsole'
import { ScoreChange } from '@/components/ui/ScoreChange'
import { ATTENTION_STEP, attentionWhy } from '@/lib/attention-copy'
import { db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { demoPostings } from '@/lib/demo/postings'
import { plural, type Translate } from '@/lib/i18n'
import { getTranslate } from '@/lib/i18n/server'
import { SAMPLE_POSTING, SAMPLE_POSTING_MARKET } from '@/lib/onboarding/sample-posting'
import { hasCredentials } from '@/lib/settings'
import { appliedAt, attentionApplications, toStatApp, waitingApplications } from '@/lib/stats'
import { computeProfileStrength } from '@/lib/strength'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran — on the
 * home page that means shipping the first-run import screen to someone who
 * already has a profile.
 */
export const dynamic = 'force-dynamic'

/**
 * One box, and what you paste into it is the only thing that changes.
 *
 * Before CVForge knows you, that is your CV. After, it is a job posting. Both
 * are the same gesture — paste, read, decide — so they are the same screen
 * rather than two destinations you have to choose between. Everything else in
 * the app is somewhere you go *from* an answer, never before one.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sample?: string }>
}) {
  const { t, locale } = await getTranslate()
  const profile = getProfile(db)
  if (!profile) return <FirstRun t={t} needsKey={!hasCredentials()} />
  const { sample } = await searchParams
  const useSample = sample === '1'

  const evidence = listEvidence(db)

  const fullApps = listFullApplications(db)

  const now = new Date().toISOString()
  const statApps = fullApps.map(toStatApp)
  const allNeeds = attentionApplications(statApps, now)
  const needsIds = new Set(allNeeds.map((i) => i.id))
  // Waiting, but not yet long enough to need a nudge: nothing to do, so it
  // is listed quietly below what does need you.
  const waiting = waitingApplications(statApps)
    .filter((a) => !needsIds.has(a.id))
    .map((a) => ({ stat: a, app: fullApps.find((f) => f.id === a.id) }))
  const interviewingCount = statApps.filter((a) => a.status === 'interviewing').length
  const strength = computeProfileStrength(profile, evidence)
  const topFix = strength.suggestions[0]
  const today = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  const daysSince = (iso: string | null) =>
    iso ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(iso)) / 86_400_000)) : 0

  const intake = (
    <>
      {useSample && (
        <p className="fact" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
          {t('home.sampleLoaded')}
        </p>
      )}
      <TriageConsole
        // Search-param-only navigations keep page state, so "/?sample=1"
        // from "/" would otherwise leave the box exactly as it was.
        key={useSample ? 'sample' : 'blank'}
        // Beside "Hoy" it is one tool among several; alone, it is the page.
        compact={fullApps.length > 0}
        defaultMarket={useSample ? SAMPLE_POSTING_MARKET : (profile.preferences.markets[0] ?? 'mx')}
        initialText={useSample ? SAMPLE_POSTING : ''}
        demoPostings={isDemo() ? demoPostings(db) : undefined}
      />
      {!useSample && !isDemo() && (
        <p style={{ marginTop: 'var(--space-3)' }}>
          <Link href="/?sample=1" className="action-quiet">
            {t('home.sample')}
          </Link>
        </p>
      )}
    </>
  )

  // Nobody to follow up on yet: the first useful move is pasting a posting,
  // so the box is the whole screen, as it always was.
  if (fullApps.length === 0) {
    return (
      <main id="main" tabIndex={-1} className="page">
        <div className="hero">
          <div className="hero-intro">
            <p className="eyebrow">{t('home.eyebrow')}</p>
            <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
              {t('home.title')}
            </h1>
            <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
              {t('home.lede')}
            </p>
          </div>
          <div>{intake}</div>
        </div>
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className="page">
      <p className="eyebrow">
        {t('today.eyebrow')} · {today}
      </p>
      <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
        {allNeeds.length > 0
          ? plural(t, allNeeds.length, 'today.needsTitle')
          : t('today.calmTitle')}
      </h1>
      <p className="lede-sm" style={{ marginTop: 'var(--space-3)' }}>
        {plural(
          t,
          waiting.length + allNeeds.filter((i) => i.reason === 'stale').length,
          'today.waitingCount',
        )}
        {interviewingCount > 0 && (
          <>
            {'  ·  '}
            {plural(t, interviewingCount, 'today.interviewingCount')}
          </>
        )}
        {'  ·  '}
        <Link href="/pipeline" className="action">
          {t('today.allApplications')}
        </Link>
      </p>

      <div className="today-grid">
        <div style={{ display: 'grid', gap: 'var(--space-8)', alignContent: 'start' }}>
          <section>
            <p className="eyebrow">{t('today.needsYou')}</p>
            {allNeeds.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
                {t('today.nothingNeeded')}
              </p>
            ) : (
              <ul className="today-list">
                {allNeeds.map((item) => {
                  const app = fullApps.find((a) => a.id === item.id)
                  if (!app) return null
                  return (
                    <li key={item.id} className={`today-card reason-${item.reason}`}>
                      <Link
                        href={`/application/${app.id}?step=${ATTENTION_STEP[item.reason]}`}
                        className="today-card-title row-stretch"
                      >
                        {app.jobTitle}
                        {app.company.trim() && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            {' · '}
                            {app.company}
                          </span>
                        )}
                      </Link>
                      <p className="why">{attentionWhy(t, item)}</p>
                      <div className="today-card-actions">
                        <Link
                          href={`/application/${app.id}?step=${ATTENTION_STEP[item.reason]}`}
                          className="action"
                        >
                          {t('today.go', { step: t(`steps.${ATTENTION_STEP[item.reason]}`) })}
                        </Link>
                        {(item.reason === 'stale' ||
                          item.reason === 'interviewing' ||
                          item.reason === 'unsent') && (
                          <OutcomeButtons
                            applicationId={app.id}
                            status={app.status}
                            extra={item.reason === 'stale' ? ['ghosted'] : []}
                          />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {waiting.length > 0 && (
            <section>
              <p className="eyebrow">{t('today.waiting')}</p>
              <ul className="today-quiet">
                {waiting.map(({ stat, app }) =>
                  app ? (
                    <li key={app.id}>
                      <Link href={`/application/${app.id}?step=track`} className="action-quiet">
                        {app.jobTitle}
                        {app.company.trim() && ` · ${app.company}`}
                      </Link>
                      <span className="fact" style={{ color: 'var(--text-faint)' }}>
                        {daysSince(appliedAt(stat)) === 0
                          ? t('today.sentToday')
                          : t('today.sentAgo', { n: daysSince(appliedAt(stat)) })}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          )}

          <section>
            <p className="eyebrow">{t('today.profile')}</p>
            <p
              style={{
                marginTop: 'var(--space-3)',
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-2)',
              }}
            >
              <span className="datum" style={{ fontSize: 28, fontWeight: 500 }}>
                <ScoreChange value={strength.score} />
              </span>
              <span className="fact" style={{ color: 'var(--text-faint)' }}>
                /100
              </span>
            </p>
            {topFix ? (
              <p
                style={{
                  color: 'var(--text-muted)',
                  font: 'var(--type-body-sm)',
                  marginTop: 'var(--space-2)',
                  maxWidth: '42em',
                }}
              >
                {say(t, topFix)}{' '}
                <Link
                  href={topFix.targetId ? `/evidence/interview/${topFix.targetId}` : '/evidence'}
                  className="action"
                >
                  {t(topFix.targetId ? 'evidence.expand' : 'today.fixIt')}
                </Link>
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
                {t('strength.nothing')}
              </p>
            )}
          </section>
        </div>

        <aside>
          <p className="eyebrow">{t('today.analyse')}</p>
          <div style={{ marginTop: 'var(--space-3)' }}>{intake}</div>
        </aside>
      </div>
    </main>
  )
}

/**
 * The wizard (product spec §4.3): key → import. Each step is one box. The
 * third step — a first posting — is the home page itself once a profile
 * exists, with "try a sample" one click away.
 */
function FirstRun({ t, needsKey }: { t: Translate; needsKey: boolean }) {
  if (needsKey) {
    return (
      <main id="main" tabIndex={-1} className="page">
        <div className="hero">
          <div className="hero-intro">
            <p className="eyebrow">{t('start.keyEyebrow')}</p>
            <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
              {t('start.keyTitle')}
            </h1>
            <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
              {t('start.keyLede')}
            </p>
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <ApiKeyForm hasSavedKey={false} envManaged={false} />
            <KeyGuide />
          </div>
        </div>
      </main>
    )
  }
  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="hero">
        <div className="hero-intro">
          <p className="eyebrow">{t('start.importEyebrow')}</p>
          <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
            {t('start.title')}
          </h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            {t('start.lede')}
          </p>
        </div>
        <ImportReview />
      </div>
    </main>
  )
}
