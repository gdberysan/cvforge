import Link from 'next/link'
import { OutcomeButtons } from '@/components/pipeline/OutcomeButtons'
import { TriageConsole } from '@/components/triage/TriageConsole'
import { Meter } from '@/components/ui/Meter'
import { VERDICT_COLOR } from '@/lib/coverage'
import { db } from '@/lib/db/client'
import {
  type ApplicationSummary,
  listApplications,
  listFullApplications,
} from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { demoPostings } from '@/lib/demo/postings'
import { plural, type Translate } from '@/lib/i18n'
import { getTranslate } from '@/lib/i18n/server'
import {
  attentionApplications,
  bandPerformance,
  daysBetween,
  toStatApp,
  velocity,
} from '@/lib/stats'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran — on the
 * home page that means shipping the first-run import screen to someone who
 * already has a profile.
 */
export const dynamic = 'force-dynamic'

const STATUS_TABS = ['triaged', 'drafting', 'applied', 'interviewing', 'offer', 'closed'] as const

/** Repeated keys (?q=a&q=b) arrive as arrays; the first one wins, never a crash. */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { t } = await getTranslate()
  const sp = await searchParams
  const show = one(sp.show)
  const q = one(sp.q)
  const status = one(sp.status)
  const showingSkipped = show === 'skipped'
  const now = new Date().toISOString()

  const needle = (q ?? '').trim().toLowerCase()
  const all = listApplications(db, { archived: showingSkipped })
  const applications = all.filter(
    (a) =>
      (!needle ||
        a.jobTitle.toLowerCase().includes(needle) ||
        a.company.toLowerCase().includes(needle)) &&
      (!status || a.status === status),
  )

  // The stats strip: arithmetic over the user's own outcomes, n always shown.
  const statApps = listFullApplications(db).map(toStatApp)
  const pace = velocity(statApps, now)
  const bands = Object.values(bandPerformance(statApps))
  const applied = bands.reduce((sum, b) => sum + b.applied, 0)
  const responded = bands.reduce((sum, b) => sum + b.responded, 0)
  const skippedCount = showingSkipped
    ? applications.length
    : listApplications(db, { archived: true }).length
  const worthPursuing = applications.filter(
    (a) => a.verdict === 'strong' || a.verdict === 'worth-it',
  ).length

  // "Piden algo de ti": one shared definition (lib/stats) with the home
  // page's Today panel. Filtering hides the section: a search is already a
  // deliberate visit to the rest of the list.
  const filtering = Boolean(needle || status)
  const attentionItems = showingSkipped || filtering ? [] : attentionApplications(statApps, now)
  const staleDays = new Map(
    attentionItems.filter((i) => i.reason === 'stale').map((i) => [i.id, i.daysSinceApplied ?? 0]),
  )
  const attention = attentionItems
    .map((i) => all.find((a) => a.id === i.id))
    .filter((a): a is ApplicationSummary => Boolean(a))
  const attentionIds = new Set(attention.map((a) => a.id))
  const rest = applications.filter((a) => !attentionIds.has(a.id))

  // The same paste box as the home page, compact: a new posting should not
  // need a trip back to / — the pipeline is where you are when the next one
  // arrives. The verdict lands in the list below as soon as it exists.
  const intake = (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <TriageConsole
        compact
        defaultMarket={getProfile(db)?.preferences.markets[0] ?? 'mx'}
        demoPostings={isDemo() ? demoPostings(db) : undefined}
      />
    </div>
  )

  return (
    // The frame matches evidence so the left edge does not jump between tabs.
    // The intro and paste box keep a working measure; the row cards below use
    // the full frame, where the coverage meter earns its column.
    <main
      style={{
        padding: 'var(--space-8) clamp(20px, 5vw, 64px) var(--space-10)',
        maxWidth: 'var(--container-xl)',
        margin: '0 auto',
      }}
    >
      <div style={{ maxWidth: 900 }}>
        <p className="eyebrow">{t('pipeline.eyebrow')}</p>
        <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
          {showingSkipped
            ? t('pipeline.skipped.title')
            : applications.length === 0 && !filtering
              ? t('pipeline.empty.title')
              : worthPursuing > 0
                ? plural(t, worthPursuing, 'pipeline.worth')
                : t('pipeline.none')}
        </h1>
      </div>

      {showingSkipped ? (
        <>
          <p className="fact" style={{ marginTop: 'var(--space-4)' }}>
            <Link href="/pipeline" className="action">
              {t('pipeline.skipped.back')}
            </Link>
          </p>
          <Rows applications={applications} t={t} now={now} />
        </>
      ) : applications.length === 0 && !filtering ? (
        <div style={{ maxWidth: 900 }}>
          <p
            style={{
              color: 'var(--text-muted)',
              marginTop: 'var(--space-4)',
              maxWidth: '34em',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {t('pipeline.empty.lede')}
          </p>
          {intake}
          {/* A pipeline can be empty precisely because everything was
              skipped; the skips stay reachable rather than vanishing. */}
          {skippedCount > 0 && (
            <p className="fact" style={{ marginTop: 'var(--space-5)' }}>
              <Link href="/pipeline?show=skipped" className="action">
                {plural(t, skippedCount, 'pipeline.skippedLink')}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div style={{ maxWidth: 900 }}>
            <p className="fact" style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)' }}>
              {plural(t, pace.appliedThisWeek, 'stats.appliedWeek')}
              {'  ·  '}
              {pace.medianResponseDays !== null
                ? t('stats.median', { n: pace.medianResponseDays })
                : t('stats.noMedian')}
              {'  ·  '}
              {applied >= 5
                ? t('stats.responseRate', { r: responded, a: applied })
                : t('stats.notEnough', { n: applied })}
              {'  ·  '}
              <Link href="/stats" className="action">
                {t('pipeline.statsLink')}
              </Link>
            </p>

            {intake}

            <form
              method="get"
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-5)',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              {status && <input type="hidden" name="status" value={status} />}
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder={t('pipeline.searchPlaceholder')}
                aria-label={t('pipeline.searchPlaceholder')}
                className="field"
                style={{ maxWidth: '16em' }}
              />
              <button type="submit" className="btn btn-quiet">
                {t('pipeline.filter')}
              </button>
            </form>
          </div>

          {/* Status tabs: links, not widgets — the URL is the filter state. */}
          <nav
            aria-label={t('pipeline.statusFilter')}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-5)',
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span
              className="fact"
              style={{ color: 'var(--text-faint)', marginRight: 'var(--space-2)' }}
            >
              {t('pipeline.statusFilter').toLowerCase()}
            </span>
            <StatusTab
              label={t('pipeline.allTab')}
              count={all.length}
              active={!status}
              href={tabHref(undefined, q)}
            />
            {STATUS_TABS.map((v) => (
              <StatusTab
                key={v}
                label={t(`status.${v}`)}
                count={all.filter((a) => a.status === v).length}
                active={status === v}
                href={tabHref(v, q)}
              />
            ))}
            <span style={{ flex: 1 }} />
            {skippedCount > 0 && (
              <Link href="/pipeline?show=skipped" className="fact action-quiet">
                {plural(t, skippedCount, 'pipeline.skippedLink')}
              </Link>
            )}
          </nav>

          {attention.length > 0 && (
            <section style={{ marginTop: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <p className="eyebrow" style={{ color: 'var(--accent)' }}>
                  {t('pipeline.attention.title')}
                </p>
                <span className="fact" style={{ color: 'var(--text-faint)' }}>
                  {t('pipeline.attention.note')}
                </span>
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 'var(--space-4) 0 0',
                  display: 'grid',
                  gap: 'var(--space-3)',
                }}
              >
                {attention.map((a) => {
                  const days = staleDays.get(a.id)
                  return (
                    <RowCard
                      key={a.id}
                      a={a}
                      t={t}
                      now={now}
                      accent
                      why={
                        days !== undefined ? t('today.staleDays', { n: days }) : t('today.unsent')
                      }
                      extraActions={days !== undefined ? ['ghosted'] : []}
                    />
                  )
                })}
              </ul>
            </section>
          )}

          <section style={{ marginTop: 'var(--space-7)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
              }}
            >
              <p className="eyebrow">
                {attention.length > 0 ? t('pipeline.rest') : t('pipeline.eyebrow')}
              </p>
              <span className="fact" style={{ color: 'var(--text-faint)' }}>
                {t('pipeline.shown', { n: rest.length + attention.length, m: all.length })}
              </span>
            </div>
            <Rows applications={rest} t={t} now={now} />
          </section>
        </>
      )}
    </main>
  )
}

function tabHref(status: string | undefined, q: string | undefined): string {
  const params = new URLSearchParams()
  if (q?.trim()) params.set('q', q)
  if (status) params.set('status', status)
  const qs = params.toString()
  return qs ? `/pipeline?${qs}` : '/pipeline'
}

function StatusTab({
  label,
  count,
  active,
  href,
}: {
  label: string
  count: number
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className="fact"
      aria-current={active ? 'page' : undefined}
      style={{
        fontSize: 12,
        letterSpacing: 'var(--tracking-wide)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        background: active ? 'var(--surface-raised)' : 'transparent',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
      }}
    >
      {label}
      <span style={{ marginLeft: 8, opacity: 0.6 }}>{count}</span>
    </Link>
  )
}

function Rows({
  applications,
  t,
  now,
}: {
  applications: ApplicationSummary[]
  t: Translate
  now: string
}) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 'var(--space-4) 0 0',
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      {applications.map((a) => (
        <RowCard key={a.id} a={a} t={t} now={now} />
      ))}
    </ul>
  )
}

function RowCard({
  a,
  t,
  now,
  why,
  accent = false,
  extraActions = [],
}: {
  a: ApplicationSummary
  t: Translate
  now: string
  /** The attention line — why this row is asking for the user's move. */
  why?: string
  accent?: boolean
  extraActions?: string[]
}) {
  const days = Math.max(0, daysBetween(a.createdAt, now))
  return (
    <li
      className="rowcard"
      style={{ borderLeft: `2px solid ${accent ? 'var(--accent)' : VERDICT_COLOR[a.verdict]}` }}
    >
      <div className="row-main">
        <div style={{ minWidth: 0, display: 'grid', gap: 'var(--space-1)' }}>
          <p style={{ font: 'var(--type-body)', margin: 0 }}>
            {/* row-stretch spreads this link over the whole card, so the
                hover promise the card makes is kept; the action buttons sit
                above it on their own layer. */}
            <Link
              href={`/application/${a.id}`}
              className="row-stretch"
              style={{ color: 'var(--text-strong)' }}
            >
              {a.jobTitle}
            </Link>
            <span style={{ color: 'var(--text-muted)' }}> · {a.company}</span>
          </p>
          {why ? (
            <p className="fact" style={{ color: 'var(--accent)', margin: 0 }}>
              {why}
            </p>
          ) : (
            <p className="fact" style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
              {days === 0 ? t('pipeline.agoToday') : t('pipeline.ago', { n: days })}
              {'  ·  '}
              {a.source}
            </p>
          )}
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-2)', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <span className="fact" style={{ fontSize: 12, color: VERDICT_COLOR[a.verdict] }}>
              {t(`verdict.${a.verdict}.label`)}
            </span>
            <span className="fact" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {t('pipeline.evidenced', { strong: a.mandatoryStrong, total: a.mandatoryTotal })}
            </span>
          </div>
          <Meter
            pct={a.mandatoryTotal > 0 ? (a.mandatoryStrong / a.mandatoryTotal) * 100 : 0}
            color={VERDICT_COLOR[a.verdict]}
            muted={a.mandatoryTotal === 0}
          />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignItems: 'center',
            // Above the stretched card link, so the buttons stay buttons.
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span
            className="fact"
            style={{
              fontSize: 12,
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 10px',
              color: 'var(--text-muted)',
            }}
          >
            {t(`status.${a.status}`)}
          </span>
          <OutcomeButtons applicationId={a.id} status={a.status} extra={extraActions} />
        </div>
      </div>
    </li>
  )
}
