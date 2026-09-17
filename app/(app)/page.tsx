import Link from 'next/link'
import { ImportReview } from '@/components/evidence/ImportReview'
import { OutcomeButtons } from '@/components/pipeline/OutcomeButtons'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { KeyGuide } from '@/components/settings/KeyGuide'
import { TriageConsole } from '@/components/triage/TriageConsole'
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
import { attentionApplications, toStatApp } from '@/lib/stats'
import { roleHealth } from '@/lib/strength'

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
  const { t } = await getTranslate()
  const profile = getProfile(db)
  if (!profile) return <FirstRun t={t} needsKey={!hasCredentials()} />
  const { sample } = await searchParams
  const useSample = sample === '1'

  const evidence = listEvidence(db)

  // The Today panel: what needs you, computed — never a reminder you set.
  // Same definition as the pipeline's attention section (lib/stats); the home
  // page just shows the top of the list.
  const fullApps = listFullApplications(db)
  const attention = attentionApplications(fullApps.map(toStatApp), new Date().toISOString())
    .map((item) => ({ ...item, app: fullApps.find((a) => a.id === item.id) }))
    .filter((item) => item.app)
    .slice(0, 5)

  const rolesOnlyStubs = profile.experience.filter(
    (role) => roleHealth(evidence, role.id).needsExpanding,
  ).length

  return (
    <main className="page">
      <div className="hero">
        <div className="hero-intro">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>{t('home.title')}</h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            {t('home.lede')}
          </p>

          {/* The one thing that would make every answer better, stated once and
              quietly. It is a footnote to the box, not a screen in front of it. */}
          {rolesOnlyStubs > 0 && (
            <p
              style={{
                marginTop: 'var(--space-5)',
                borderLeft: '2px solid var(--accent)',
                paddingLeft: 'var(--space-3)',
                color: 'var(--text-muted)',
                font: 'var(--type-body-sm)',
              }}
            >
              {plural(t, rolesOnlyStubs, 'home.nudge')}{' '}
              <Link href="/evidence" className="action">
                {t('evidence.expand')}
              </Link>
            </p>
          )}
        </div>

        {useSample && (
          <p
            className="fact"
            style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}
          >
            {t('home.sampleLoaded')}
          </p>
        )}
        <TriageConsole
          // Search-param-only navigations keep page state, so "/?sample=1"
          // from "/" would otherwise leave the box exactly as it was.
          key={useSample ? 'sample' : 'blank'}
          defaultMarket={
            useSample ? SAMPLE_POSTING_MARKET : (profile.preferences.markets[0] ?? 'mx')
          }
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
      </div>

      {attention.length > 0 && (
        <section style={{ marginTop: 'var(--space-9)', maxWidth: 720 }}>
          <p className="eyebrow">{t('today.eyebrow')}</p>
          <ul
            className="stack"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 'var(--space-4) 0 0',
              gap: 'var(--space-4)',
            }}
          >
            {attention.map(({ app, reason, daysSinceApplied }) =>
              app ? (
                <li
                  key={app.id}
                  style={{
                    borderLeft: `2px solid ${
                      reason === 'stale' ? 'var(--graphite-200)' : 'var(--accent)'
                    }`,
                    paddingLeft: 'var(--space-3)',
                  }}
                >
                  <Link
                    href={`/application/${app.id}`}
                    className="action"
                    style={{ margin: 0, padding: 0 }}
                  >
                    {app.jobTitle} · {app.company}
                  </Link>
                  <p
                    className="fact"
                    style={{ color: 'var(--text-muted)', margin: 'var(--space-1) 0 0' }}
                  >
                    {reason === 'stale'
                      ? t('today.staleDays', { n: daysSinceApplied ?? 0 })
                      : t('today.unsent')}{' '}
                    <OutcomeButtons
                      applicationId={app.id}
                      status={app.status}
                      extra={reason === 'stale' ? ['ghosted'] : []}
                    />
                  </p>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
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
      <main className="page">
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
    <main className="page">
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
