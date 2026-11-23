import Link from 'next/link'
import { Cells, ReplyDots, WeekBars } from '@/components/stats/KpiViz'
import { BackLink } from '@/components/ui/BackLink'
import { Meter } from '@/components/ui/Meter'
import { VERDICT_COLOR } from '@/lib/coverage'
import { sourceLabels } from '@/lib/evidence-label'
import { plural, type Translate } from '@/lib/i18n'
import type { StatsData } from '@/lib/pages/stats'
import type { Coverage } from '@/lib/schemas'
import {
  bandPerformance,
  evidenceLeaderboard,
  gapRecurrence,
  sourcePerformance,
  staleApplications,
  staleThresholdDays,
  velocity,
  waitingCount,
  weeklySent,
} from '@/lib/stats'
import { openingWords } from '@/lib/ui/readable-reason'

/** Below this, a figure says "not enough data yet" instead of pretending. */
const MIN_N = 5

const BAND_ORDER: Coverage['verdict'][] = ['strong', 'worth-it', 'stretch', 'skip']

/** A card's header: one title, at most one explanation line under it. */
function BoardHead({ title, lede }: { title: string; lede?: React.ReactNode }) {
  return (
    <header className="board-head">
      <h2>{title}</h2>
      {lede && <p>{lede}</p>}
    </header>
  )
}

/** "7 de 18 · 39 %", or, below the honesty threshold, "Pocos datos · 2". */
function Ratio({ t, r, a }: { t: Translate; r: number; a: number }) {
  return a >= MIN_N ? (
    <span className="row-value">{t('stats.ratio', { r, a, p: Math.round((r / a) * 100) })}</span>
  ) : (
    <span className="row-value is-quiet">{t('stats.notEnough', { n: a })}</span>
  )
}

/** Números, from lib/pages/stats.ts's data; every figure is computed here. */
export function StatsView({ data, t }: { data: StatsData; t: Translate }) {
  // Historical rates read everything ever triaged; "waiting on a human" reads
  // only what is still active — an application skipped into the archive is
  // not waiting on anyone, and the pipeline computes over the same set.
  const active = data.active
  const apps = active.concat(data.archived)
  const now = new Date().toISOString()

  const bands = bandPerformance(apps)
  const applied = Object.values(bands).reduce((sum, b) => sum + b.applied, 0)
  const responded = Object.values(bands).reduce((sum, b) => sum + b.responded, 0)
  const gaps = gapRecurrence(apps).slice(0, 8)
  const sources = sourcePerformance(apps)
  const allEvidence = data.evidence
  const profile = data.profile
  const evidenceById = new Map(allEvidence.map((e) => [e.id, e.text]))
  const labelById = sourceLabels(allEvidence, profile)
  const leaders = evidenceLeaderboard(apps, new Set(evidenceById.keys())).slice(0, 8)
  const pace = velocity(apps, now)
  const waiting = waitingCount(active)
  const stale = staleApplications(active, now).length
  const weeks = weeklySent(apps, now)

  if (applied === 0) {
    return (
      <main id="main" tabIndex={-1} className="page stats-page">
        <BackLink href="/" label={t('nav.today')} />
        <header className="page-head">
          <p className="eyebrow">{t('stats.eyebrow')}</p>
          <h1 className="page-title">{t('stats.empty.title')}</h1>
          <p className="page-lede">{t('stats.empty.lede')}</p>
        </header>
        <p>
          {/* The step that moves you forward: a first analysis, or marking
              one you already have as sent. */}
          <Link href={apps.length === 0 ? '/' : '/pipeline'} className="btn btn-primary">
            {apps.length === 0 ? t('nav.analyse') : t('nav.pipeline')}
          </Link>
        </p>
      </main>
    )
  }

  const kpis = [
    {
      label: t('stats.kpi.week'),
      value: String(pace.appliedThisWeek),
      tone: 'plain',
      note: t('stats.kpi.weekNote', { n: pace.appliedPrevWeek }),
      viz: <WeekBars weeks={weeks} />,
    },
    {
      label: t('stats.kpi.median'),
      value:
        pace.medianResponseDays === null ? '—' : plural(t, pace.medianResponseDays, 'stats.days'),
      tone: pace.medianResponseDays === null ? 'quiet' : 'plain',
      note:
        pace.timedResponses === 0
          ? t('stats.noMedian')
          : plural(t, pace.timedResponses, 'stats.kpi.medianNote'),
      viz: <ReplyDots days={pace.responseDays} median={pace.medianResponseDays} />,
    },
    {
      label: t('stats.kpi.rate'),
      value: applied >= MIN_N ? `${Math.round((responded / applied) * 100)}%` : '—',
      tone: applied >= MIN_N ? 'plain' : 'quiet',
      note:
        applied >= MIN_N
          ? t('stats.responded', { r: responded, a: applied })
          : t('stats.kpi.needsN', { n: MIN_N }),
      viz: <Cells total={applied} filled={responded} tone="strong" />,
    },
    {
      label: t('stats.kpi.waiting'),
      value: String(waiting),
      tone: 'plain',
      note:
        stale > 0
          ? t('stats.kpi.waitingNote', { n: stale, d: staleThresholdDays(active, now) })
          : '',
      // Oldest first, so the ones waiting too long come first and in amber.
      viz: <Cells total={waiting} filled={stale} tone="warm" rest="ink" />,
    },
  ]

  return (
    <main id="main" tabIndex={-1} className="page stats-page">
      <BackLink href="/" label={t('nav.today')} />
      <header className="page-head">
        <p className="eyebrow">{t('stats.eyebrow')}</p>
        <h1 className="page-title">{t('stats.title')}</h1>
        <p className="page-lede">{t('stats.lede')}</p>
      </header>

      <section aria-label={t('stats.eyebrow')} className="kpi-row">
        {kpis.map((k) => (
          <div key={k.label} className={`board kpi kpi-${k.tone}`}>
            <p className="kpi-label">{k.label}</p>
            <p className="kpi-value">{k.value}</p>
            <p className="kpi-note">{k.note || '\u00A0'}</p>
            {k.viz}
          </div>
        ))}
      </section>

      <div className="stat-grid">
        {/* 6.1 — the stat that eventually replaces the guessed thresholds. */}
        <section className="board">
          <BoardHead title={t('stats.bands.title')} lede={t('stats.bands.lede')} />
          <ul className="rows">
            {BAND_ORDER.filter((v) => bands[v]).map((v) => {
              const b = bands[v]
              return (
                <li key={v} className="row has-meter">
                  <span className={`row-label verdict-text-${v}`}>{t(`verdict.${v}.label`)}</span>
                  <Ratio t={t} r={b.responded} a={b.applied} />
                  <Meter
                    pct={(b.responded / b.applied) * 100}
                    color={VERDICT_COLOR[v]}
                    muted={b.applied < MIN_N}
                  />
                </li>
              )
            })}
          </ul>
        </section>

        {/* 6.3 — source performance. */}
        <section className="board">
          <BoardHead title={t('stats.sources.title')} lede={t('stats.sources.lede')} />
          <ul className="rows">
            {sources.map((row) => (
              <li key={row.source} className="row has-meter">
                <span className="row-label">{t(`source.${row.source}`)}</span>
                <Ratio t={t} r={row.responded} a={row.applied} />
                <Meter
                  pct={(row.responded / row.applied) * 100}
                  color="var(--tone-strong)"
                  muted={row.applied < MIN_N}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* 6.2 — gap recurrence, with the disambiguating question. */}
        <section className="board is-wide">
          <BoardHead
            // "Again and again" only when something has come up more than once.
            title={t(gaps.some((g) => g.count > 1) ? 'stats.gaps.title' : 'stats.gaps.titleOnce')}
            lede={
              <>
                {t('stats.gaps.lede')}{' '}
                <Link href="/evidence" className="action">
                  {t('stats.gaps.add')}
                </Link>
              </>
            }
          />
          {gaps.length === 0 ? (
            <p className="board-empty">{t('stats.gaps.none')}</p>
          ) : (
            <ul className="chips">
              {gaps.map((g) => (
                <li key={g.keyword} className="count-chip">
                  <span>{g.keyword}</span>
                  <span className="count-chip-n">{plural(t, g.count, 'stats.times')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 6.4 — evidence leaderboard, honest about low n. */}
        {leaders.length > 0 && (
          <section className="board is-wide">
            <BoardHead title={t('stats.leaders.title')} lede={t('stats.leaders.lede')} />
            <ul className="rows is-two">
              {leaders.map((row) => (
                <li key={row.evidenceId} className="row is-stacked leader-row">
                  {/* The achievement opens in full on request; the closed row
                      shows its opening and where it happened. */}
                  <details className="leader">
                    <summary>
                      <span className="row-label">
                        {openingWords(evidenceById.get(row.evidenceId) ?? row.evidenceId, 64)}
                      </span>
                      <span className={row.responded > 0 ? 'row-value' : 'row-value is-quiet'}>
                        {t('stats.responded', { r: row.responded, a: row.cited })}
                      </span>
                    </summary>
                    <p className="leader-full">
                      {evidenceById.get(row.evidenceId) ?? row.evidenceId}
                    </p>
                  </details>
                  <Meter pct={(row.responded / row.cited) * 100} color="var(--tone-strong)" />
                  <p className="row-detail">{labelById[row.evidenceId] || ''}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="stats-foot">
        {applied < MIN_N
          ? t('stats.foot.sparse', { n: applied })
          : t('stats.foot.mature', { n: applied, m: MIN_N })}
      </p>
    </main>
  )
}
