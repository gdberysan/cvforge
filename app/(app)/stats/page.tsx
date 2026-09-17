import Link from 'next/link'
import { Meter } from '@/components/ui/Meter'
import { VERDICT_COLOR } from '@/lib/coverage'
import { db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { plural } from '@/lib/i18n'
import { getTranslate } from '@/lib/i18n/server'
import type { Coverage } from '@/lib/schemas'
import {
  bandPerformance,
  evidenceLeaderboard,
  gapRecurrence,
  sourcePerformance,
  staleApplications,
  staleThresholdDays,
  toStatApp,
  velocity,
  waitingCount,
} from '@/lib/stats'

export const dynamic = 'force-dynamic'

/** Below this, a figure says "not enough data yet" instead of pretending. */
const MIN_N = 5

const BAND_ORDER: Coverage['verdict'][] = ['strong', 'worth-it', 'stretch', 'skip']

function SectionHead({ title, num, lede }: { title: string; num: string; lede?: string }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <p className="eyebrow">{title}</p>
        <span className="ident" style={{ color: 'var(--text-faint)' }}>
          {num}
        </span>
      </div>
      {lede && (
        <p style={{ color: 'var(--text-muted)', font: 'var(--type-body-sm)', maxWidth: '46ch' }}>
          {lede}
        </p>
      )}
    </>
  )
}

export default async function StatsPage() {
  const { t } = await getTranslate()
  // Historical rates read everything ever triaged; "waiting on a human" reads
  // only what is still active — an application skipped into the archive is
  // not waiting on anyone, and the pipeline computes over the same set.
  const active = listFullApplications(db, { archived: false }).map(toStatApp)
  const apps = active.concat(listFullApplications(db, { archived: true }).map(toStatApp))
  const now = new Date().toISOString()

  const bands = bandPerformance(apps)
  const applied = Object.values(bands).reduce((sum, b) => sum + b.applied, 0)
  const responded = Object.values(bands).reduce((sum, b) => sum + b.responded, 0)
  const gaps = gapRecurrence(apps).slice(0, 8)
  const sources = sourcePerformance(apps)
  const evidenceById = new Map(listEvidence(db).map((e) => [e.id, e.text]))
  const leaders = evidenceLeaderboard(apps, new Set(evidenceById.keys())).slice(0, 8)
  const pace = velocity(apps, now)
  const waiting = waitingCount(active)
  const stale = staleApplications(active, now).length

  if (applied === 0) {
    return (
      <main className="page page-narrow">
        <p className="eyebrow">{t('stats.eyebrow')}</p>
        <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
          {t('stats.empty.title')}
        </h1>
        <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
          {t('stats.empty.lede')}
        </p>
        <Link
          href="/pipeline"
          className="btn btn-primary"
          style={{ display: 'inline-block', marginTop: 'var(--space-6)' }}
        >
          {t('nav.pipeline')}
        </Link>
      </main>
    )
  }

  const kpis = [
    {
      label: t('stats.kpi.week'),
      value: String(pace.appliedThisWeek),
      tone: 'var(--text-strong)',
      note: t('stats.kpi.weekNote', { n: pace.appliedPrevWeek }),
    },
    {
      label: t('stats.kpi.median'),
      value: pace.medianResponseDays === null ? '—' : `${pace.medianResponseDays}d`,
      tone: pace.medianResponseDays === null ? 'var(--text-faint)' : 'var(--text-strong)',
      note:
        pace.timedResponses === 0
          ? t('stats.noMedian')
          : plural(t, pace.timedResponses, 'stats.kpi.medianNote'),
    },
    {
      label: t('stats.kpi.rate'),
      value: applied >= MIN_N ? `${Math.round((responded / applied) * 100)}%` : '—',
      tone: applied >= MIN_N ? 'var(--accent)' : 'var(--text-faint)',
      note:
        applied >= MIN_N
          ? t('stats.responded', { r: responded, a: applied })
          : t('stats.kpi.needsN', { n: MIN_N }),
    },
    {
      label: t('stats.kpi.waiting'),
      value: String(waiting),
      tone: waiting > 0 ? 'var(--accent)' : 'var(--text-strong)',
      note:
        stale > 0
          ? t('stats.kpi.waitingNote', { n: stale, d: staleThresholdDays(active, now) })
          : '',
    },
  ]

  return (
    <main className="page">
      <header
        style={{ paddingBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <p className="eyebrow">{t('stats.eyebrow')}</p>
        <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-3)', maxWidth: '26ch' }}>
          {t('stats.title')}
        </h1>
      </header>

      <section
        aria-label={t('stats.eyebrow')}
        className="kpi-row"
        style={{ marginTop: 'var(--space-6)' }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="panel"
            style={{
              padding: 'var(--space-5)',
              display: 'grid',
              gap: 'var(--space-3)',
              alignContent: 'start',
            }}
          >
            <p className="eyebrow" style={{ letterSpacing: '0.14em' }}>
              {k.label}
            </p>
            <p
              className="mono"
              style={{
                fontSize: 39,
                fontWeight: 500,
                lineHeight: 1,
                color: k.tone,
                fontVariantNumeric: 'tabular-nums',
                margin: 0,
              }}
            >
              {k.value}
            </p>
            {k.note && (
              <p className="fact" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                {k.note}
              </p>
            )}
          </div>
        ))}
      </section>

      <div className="stat-grid" style={{ marginTop: 'var(--space-5)' }}>
        {/* 6.1 — the stat that eventually replaces the guessed thresholds. */}
        <section
          className="panel"
          style={{
            padding: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-4)',
            alignContent: 'start',
          }}
        >
          <SectionHead title={t('stats.bands.title')} num="01" lede={t('stats.bands.lede')} />
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            {BAND_ORDER.filter((v) => bands[v]).map((v) => {
              const b = bands[v]
              const enough = b.applied >= MIN_N
              return (
                <li key={v} style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <span className="fact" style={{ color: VERDICT_COLOR[v] }}>
                      {t(`verdict.${v}.label`)}
                    </span>
                    <span
                      className="fact"
                      style={{ color: enough ? 'var(--text-strong)' : 'var(--text-faint)' }}
                    >
                      {enough
                        ? t('stats.ratio', {
                            r: b.responded,
                            a: b.applied,
                            p: Math.round((b.responded / b.applied) * 100),
                          })
                        : `n=${b.applied}`}
                    </span>
                  </div>
                  <Meter
                    pct={(b.responded / b.applied) * 100}
                    color={VERDICT_COLOR[v]}
                    muted={!enough}
                  />
                </li>
              )
            })}
          </ul>
        </section>

        {/* 6.3 — source performance. */}
        <section
          className="panel"
          style={{
            padding: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-4)',
            alignContent: 'start',
          }}
        >
          <SectionHead title={t('stats.sources.title')} num="02" lede={t('stats.sources.lede')} />
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            {sources.map((row) => {
              const enough = row.applied >= MIN_N
              return (
                <li
                  key={row.source}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    paddingBottom: 'var(--space-3)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span className="fact" style={{ color: 'var(--text-strong)' }}>
                    {row.source}
                  </span>
                  <span
                    className="fact"
                    style={{ color: enough ? 'var(--text-strong)' : 'var(--text-faint)' }}
                  >
                    {enough
                      ? t('stats.ratio', {
                          r: row.responded,
                          a: row.applied,
                          p: Math.round((row.responded / row.applied) * 100),
                        })
                      : `n=${row.applied}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* 6.2 — gap recurrence, with the disambiguating question. */}
        <section
          className="panel"
          style={{
            padding: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-4)',
            alignContent: 'start',
          }}
        >
          <SectionHead title={t('stats.gaps.title')} num="03" />
          <p style={{ color: 'var(--text-muted)', font: 'var(--type-body-sm)', maxWidth: '46ch' }}>
            {t('stats.gaps.lede')}{' '}
            <Link href="/evidence" className="action">
              {t('stats.gaps.add')}
            </Link>
          </p>
          {gaps.length === 0 ? (
            <p className="fact" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
              {t('stats.gaps.none')}
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              {gaps.map((g) => (
                <li
                  key={g.keyword}
                  className="fact"
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-2)',
                    background: 'var(--surface-inset)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px',
                  }}
                >
                  <span style={{ color: 'var(--text-strong)' }}>{g.keyword}</span>
                  <span
                    style={{ color: 'var(--text-faint)' }}
                    title={plural(t, g.count, 'stats.gapCount')}
                  >
                    ×{g.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 6.4 — evidence leaderboard, honest about low n. */}
        {leaders.length > 0 && (
          <section
            className="panel"
            style={{
              padding: 'var(--space-6)',
              display: 'grid',
              gap: 'var(--space-4)',
              alignContent: 'start',
            }}
          >
            <SectionHead title={t('stats.leaders.title')} num="04" lede={t('stats.leaders.lede')} />
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'grid',
                gap: 'var(--space-4)',
              }}
            >
              {leaders.map((row) => (
                <li
                  key={row.evidenceId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                    gap: 'var(--space-3)',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className="ident"
                    style={{ color: row.responded > 0 ? 'var(--accent)' : 'var(--text-faint)' }}
                  >
                    {row.evidenceId}
                  </span>
                  <div style={{ minWidth: 0, display: 'grid', gap: 'var(--space-1)' }}>
                    <span
                      className="fact"
                      style={{ color: row.responded > 0 ? 'var(--accent)' : 'var(--text-faint)' }}
                    >
                      {t('stats.responded', { r: row.responded, a: row.cited })}
                    </span>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        font: 'var(--type-body-sm)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        margin: 0,
                      }}
                    >
                      {evidenceById.get(row.evidenceId) ?? row.evidenceId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p
        className="fact"
        style={{
          marginTop: 'var(--space-6)',
          color: 'var(--text-faint)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
        }}
      >
        <span style={{ color: 'var(--accent)' }}>{'//'}</span>
        {applied < MIN_N
          ? t('stats.foot.sparse', { n: applied })
          : t('stats.foot.mature', { n: applied, m: MIN_N })}
      </p>
    </main>
  )
}
