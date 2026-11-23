import Link from 'next/link'
import { ActionGrid } from '@/components/pipeline/ActionGrid'
import { StageTrack } from '@/components/pipeline/StageTrack'
import { TriageConsole } from '@/components/triage/TriageConsole'
import { BackLink } from '@/components/ui/BackLink'
import { IconAnalyse, IconChevron, IconClose } from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import { ScrollActiveIntoView } from '@/components/ui/ScrollActiveIntoView'
import { companyName } from '@/lib/company-name'
import type { ApplicationSummary } from '@/lib/db/queries/applications'
import { plural, type Translate } from '@/lib/i18n'
import { defaultMarket } from '@/lib/markets'
import { attentionPrompt } from '@/lib/overview-status'
import type { CardState, PipelineData } from '@/lib/pages/pipeline'
import type { OutcomeType } from '@/lib/schemas'
import { nextOutcomes, stagePosition } from '@/lib/stage'
import type { AttentionItem, AttentionReason } from '@/lib/stats'

const STATUS_TABS = ['triaged', 'drafting', 'applied', 'interviewing', 'offer', 'closed'] as const

/** Postulaciones, from lib/pages/pipeline.ts's data. */
export function PipelineView({ data, t }: { data: PipelineData; t: Translate }) {
  const {
    q,
    status,
    showingSkipped,
    filtering,
    all,
    applications,
    attention,
    rest,
    itemOf,
    latestOf,
    stateOf,
    skippedCount,
    worthPursuing,
    markets,
  } = data

  // The same paste box as the home page, compact: a new posting should not
  // need a trip back to / — the pipeline is where you are when the next one
  // arrives. The verdict lands in the list below as soon as it exists.
  const intake = (
    <div className="pipeline-intake">
      <TriageConsole
        compact
        defaultMarket={defaultMarket(markets)}
        ownMarkets={markets}
        demoPostings={data.demoPostings}
      />
    </div>
  )

  const skippedLink = skippedCount > 0 && (
    <p className="pipeline-skipped">
      <Link href="/pipeline?show=skipped" className="action-quiet icon-label">
        {plural(t, skippedCount, 'pipeline.skippedLink')}
        <IconChevron />
      </Link>
    </p>
  )

  return (
    // The frame matches evidence so the left edge does not jump between tabs.
    // The intro and paste box keep a working measure; the row cards below use
    // the full frame, where the coverage meter earns its column.
    <main id="main" tabIndex={-1} className="pipeline-page">
      <div className="pipeline-intro">
        {showingSkipped ? (
          <BackLink href="/pipeline" label={t('nav.pipeline')} />
        ) : (
          <BackLink href="/" label={t('nav.today')} />
        )}
        {/* The title says what the page is; how many are worth it is the
            line under it, not the page's name. */}
        <h1 className="pipeline-title">
          {showingSkipped
            ? t('pipeline.skipped.title')
            : applications.length === 0 && !filtering
              ? t('pipeline.empty.title')
              : t('pipeline.eyebrow')}
        </h1>
        {!showingSkipped && (applications.length > 0 || filtering) && (
          <p className="pipeline-lede">
            {worthPursuing > 0 ? plural(t, worthPursuing, 'pipeline.worth') : t('pipeline.none')}
          </p>
        )}
      </div>

      {showingSkipped ? (
        <>
          {/* The page title already says what these are: no second heading. */}
          <Rows
            applications={applications}
            t={t}
            stateOf={stateOf}
            latestOf={latestOf}
            settledTitle={null}
          />
        </>
      ) : applications.length === 0 && !filtering ? (
        <div className="pipeline-intro">
          <p className="pipeline-empty-lede">{t('pipeline.empty.lede')}</p>
          {intake}
          {/* A pipeline can be empty precisely because everything was
              skipped; the skips stay reachable rather than vanishing. */}
          {skippedLink}
        </div>
      ) : (
        <>
          <div className="pipeline-intro">
            {/* The paste box lives on Analizar, and the pace figures on
                Números: this page is the list. One line points to each. */}
            <p className="pipeline-links">
              <Link href="/" className="btn btn-primary icon-label">
                <IconAnalyse />
                {t('pipeline.analyseLink')}
              </Link>
              <Link href="/stats" className="btn btn-quiet icon-label">
                {t('pipeline.statsLink')}
                <IconChevron />
              </Link>
            </p>

            <form method="get" className="search-field">
              {status && <input type="hidden" name="status" value={status} />}
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder={t('pipeline.searchPlaceholder')}
                aria-label={t('pipeline.searchPlaceholder')}
                className="search-input"
              />
              {/* With a search on, the way out is right there in the field. */}
              {q?.trim() ? (
                <Link
                  href={tabHref(status, undefined)}
                  className="search-submit"
                  aria-label={t('pipeline.clearSearch')}
                >
                  <IconClose />
                </Link>
              ) : (
                <button type="submit" className="search-submit" aria-label={t('pipeline.filter')}>
                  <IconAnalyse />
                </button>
              )}
            </form>
          </div>

          {/* Status filters: links, not widgets — the URL is the filter state.
              One even row; on a narrow phone it scrolls inside itself. */}
          <ScrollActiveIntoView selector=".seg-links [aria-current='page']" />
          <nav aria-label={t('pipeline.statusFilter')} className="seg-links">
            <StatusTab
              label={t('pipeline.allTab')}
              count={all.length}
              active={!status}
              href={tabHref(undefined, q)}
            />
            {/* A filter with nothing behind it is noise ("oferta 0"); it appears
                once something reaches that status, or while it is selected. */}
            {STATUS_TABS.filter((v) => v === status || all.some((a) => a.status === v)).map((v) => (
              <StatusTab
                key={v}
                label={t(`status.${v}`)}
                count={all.filter((a) => a.status === v).length}
                active={status === v}
                href={tabHref(v, q)}
              />
            ))}
          </nav>
          {skippedLink}

          {attention.length > 0 && (
            <section className="pipeline-section">
              <div className="pipeline-section-head">
                <p className="eyebrow is-accent">{t('pipeline.attention.title')}</p>
                <span className="pipeline-section-note">{t('pipeline.attention.note')}</span>
              </div>
              <ul className="row-list">
                {attention.map((a) => {
                  const item = itemOf[a.id]
                  return (
                    <RowCard
                      key={a.id}
                      a={a}
                      t={t}
                      state={stateOf[a.id] ?? { line: '', upcoming: false }}
                      latest={latestOf[a.id] ?? null}
                      accent
                      ask={item ? askOf(item, a, latestOf[a.id] ?? null) : undefined}
                    />
                  )
                })}
              </ul>
            </section>
          )}

          {/* When everything is already above, under "your move", an empty
              "the rest" would be a heading over nothing. */}
          {(rest.length > 0 || attention.length === 0 || filtering) && (
            <section className="pipeline-section">
              <div className="pipeline-section-head is-split">
                <p className="eyebrow">
                  {attention.length > 0 ? t('pipeline.rest') : t('pipeline.eyebrow')}
                </p>
                <span className="pipeline-section-note">
                  {t('pipeline.shown', { n: rest.length + attention.length, m: all.length })}
                </span>
              </div>
              {rest.length + attention.length === 0 && filtering ? (
                <div className="board-empty-panel">
                  <p>{q ? t('pipeline.noMatch', { q }) : t('pipeline.noMatchStatus')}</p>
                  <Link href="/pipeline" className="btn btn-quiet">
                    {t('pipeline.clearSearch')}
                  </Link>
                </div>
              ) : (
                <Rows
                  applications={rest}
                  t={t}
                  stateOf={stateOf}
                  latestOf={latestOf}
                  // With the "closed" tab on, the tab already says what these are.
                  settledTitle={status === 'closed' ? null : undefined}
                />
              )}
            </section>
          )}
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
    <Link href={href} className="seg-link" aria-current={active ? 'page' : undefined}>
      <span className="seg-label">{label}</span>
      <span className="seg-count">{count}</span>
    </Link>
  )
}

/**
 * Why the attention card is here, and the taps that answer it. The card's
 * state line joins the question (`attentionPrompt`); the grid holds the
 * outcomes that can happen next — "No answer" only once the silence is stale.
 */
function askOf(
  item: AttentionItem,
  a: ApplicationSummary,
  latest: OutcomeType | null,
): { reason: AttentionReason; actions: OutcomeType[] } {
  return {
    reason: item.reason,
    actions: nextOutcomes(a.status, { stale: item.reason === 'stale', latest }),
  }
}

function Rows({
  applications,
  t,
  stateOf,
  latestOf,
  settledTitle,
}: {
  applications: ApplicationSummary[]
  t: Translate
  stateOf: Record<string, CardState>
  latestOf: Record<string, OutcomeType | null>
  /** The settled list's heading; null where the page title already names it. */
  settledTitle?: string | null
}) {
  // Settled ones (a no, withdrawn, silence, discarded) need nothing from
  // you: one compact list after the live cards, not a full card each with
  // a stepper that always reads the same.
  const settled = (a: ApplicationSummary) => {
    const end = stagePosition(a.status, latestOf[a.id] ?? null).end
    return Boolean(end) && end !== 'offer'
  }
  const live = applications.filter((a) => !settled(a))
  // Settled ones newest ending first: the list reads as a history.
  const done = applications
    .filter(settled)
    .sort((x, y) =>
      (stateOf[y.id]?.settled?.at ?? y.createdAt).localeCompare(
        stateOf[x.id]?.settled?.at ?? x.createdAt,
      ),
    )
  return (
    <>
      {live.length > 0 && (
        <ul className="row-list">
          {live.map((a) => (
            <RowCard
              key={a.id}
              a={a}
              t={t}
              state={stateOf[a.id] ?? { line: '', upcoming: false }}
              latest={latestOf[a.id] ?? null}
            />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section
          className="board settled-list"
          aria-labelledby={settledTitle === null ? undefined : 'h-settled'}
        >
          {settledTitle !== null && (
            <header className="board-head">
              <h2 id="h-settled">
                {settledTitle ?? t('pipeline.settled')} <span className="count">{done.length}</span>
              </h2>
            </header>
          )}
          <ul className="settled-rows">
            {done.map((a) => (
              <li key={a.id} className="settled-row">
                <span className="settled-what">
                  <Link href={`/application/${a.id}`} className="settled-title row-stretch">
                    {a.jobTitle}
                  </Link>
                  {companyName(a.company) && (
                    <span className="settled-company">{companyName(a.company)}</span>
                  )}
                </span>
                {/* How it ended and when, in two columns that line up down the
                    list; a discarded one says what CVForge made of it. */}
                {stateOf[a.id]?.settled ? (
                  <span className="settled-state">
                    <span className={`settled-word is-${stateOf[a.id]?.settled?.end}`}>
                      {stateOf[a.id]?.settled?.word}
                    </span>
                    <span className="settled-when num">{stateOf[a.id]?.settled?.when ?? ''}</span>
                  </span>
                ) : a.status === 'archived' ? (
                  <span className="settled-state">
                    <span className={`settled-word verdict-text-${a.verdict}`}>
                      {t(`verdict.${a.verdict}.label`)}
                    </span>
                  </span>
                ) : (
                  <span className="settled-state">{stateOf[a.id]?.line ?? ''}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * One application (mockup Pipeline2): the title, "Company · verdict · 9/15",
 * the stage track, and one line of state. On an attention card the question
 * joins that line and its 2×2 grid of answers follows.
 */
function RowCard({
  a,
  t,
  state,
  latest,
  ask,
  accent = false,
}: {
  a: ApplicationSummary
  t: Translate
  /** `cardStatus`: where it stands, in words. */
  state: CardState
  /** The newest logged outcome, for where the stage track ends. */
  latest: OutcomeType | null
  /** On an attention card: the question it asks, and the taps that answer. */
  ask?: { reason: AttentionReason; actions: OutcomeType[] }
  accent?: boolean
}) {
  const position = stagePosition(a.status, latest, state.facts)
  const asking = ask && ask.actions.length > 0
  return (
    <li
      className={`rowcard ${accent ? 'is-attention' : `verdict-${a.verdict}`}${position.end && position.end !== 'offer' ? ' is-ended' : ''}${position.end === 'offer' ? ' is-offer' : ''}`}
    >
      <div className="row-main">
        <div className="row-what">
          <p className="row-title">
            {/* row-stretch spreads this link over the whole card, so the
                hover promise the card makes is kept; the action buttons sit
                above it on their own layer. */}
            <Link href={`/application/${a.id}`} className="row-stretch">
              {a.jobTitle}
            </Link>
          </p>
          <p className="row-meta">
            {/* A posting from an agency often names no employer: Meta drops
                the empty item, so no dangling separator. */}
            <Meta>
              {companyName(a.company)}
              <span className={`row-verdict verdict-text-${a.verdict}`}>
                {t(`verdict.${a.verdict}.label`)}
              </span>
              {a.mandatoryTotal > 0 && (
                <span className="row-fit">
                  <span aria-hidden>
                    {t('fit.shortReq', { n: a.mandatoryStrong, total: a.mandatoryTotal })}
                  </span>
                  <span className="sr-only">
                    {t('pipeline.fit', { strong: a.mandatoryStrong, total: a.mandatoryTotal })}
                  </span>
                </span>
              )}
            </Meta>
          </p>
        </div>
        <div className="row-stage">
          <StageTrack {...position} />
        </div>
      </div>
      {asking ? (
        // Above the stretched card link, so the buttons stay buttons.
        <div className="row-ask">
          <ActionGrid
            applicationId={a.id}
            actions={ask.actions}
            prompt={attentionPrompt(t, {
              state: state.line,
              reason: ask.reason,
              upcoming: state.upcoming,
            })}
          />
        </div>
      ) : (
        <p className="row-state">{state.line}</p>
      )}
    </li>
  )
}
