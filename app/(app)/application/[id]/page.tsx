import { notFound } from 'next/navigation'
import { z } from 'zod'
import { DecideActions } from '@/components/application/DecideActions'
import { DeleteApplication } from '@/components/application/DeleteApplication'
import { FocusOnStep } from '@/components/application/FocusOnStep'
import { GapEntry } from '@/components/application/GapEntry'
import { GapFill } from '@/components/application/GapFill'
import { Reanalyse } from '@/components/application/Reanalyse'
import { StepNav } from '@/components/application/StepNav'
import { Timeline } from '@/components/application/Timeline'
import { OutcomeButtons } from '@/components/pipeline/OutcomeButtons'
import { Workspace } from '@/components/studio/Workspace'
import { CoverageBar } from '@/components/triage/CoverageBar'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { currentStep, isStep, nextStep, type Step, stepStates } from '@/lib/application-steps'
import { VERDICT_COLOR, VERDICT_KEYS } from '@/lib/coverage'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { sourceLabels } from '@/lib/evidence-label'
import { selectGaps } from '@/lib/gaps/select'
import { hashEvidenceProjection } from '@/lib/hash'
import { getTranslate } from '@/lib/i18n/server'
import { safeHttpUrl } from '@/lib/posting-source'
import {
  CoverLetterSchema,
  CVContentSchema,
  GroundingReportSchema,
  RecruiterMessageSchema,
  ScreeningSetSchema,
} from '@/lib/schemas'

/** Companions persist as { document, report }; either half failing to parse reads as absent. */
function companionOf<S extends z.ZodTypeAny>(schema: S, raw: unknown) {
  const parsed = z.object({ document: schema, report: GroundingReportSchema }).safeParse(raw)
  return parsed.success ? parsed.data : null
}

// §10.3: strong glows amber, partial is steel, missing is oxide. Steel, not
// a darker graphite — the tier word is small text and must stay readable.
const STRENGTH_COLOR = {
  strong: 'var(--accent)',
  partial: 'var(--tone-partial)',
  none: 'var(--signal-error)',
} as const

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gapdelta?: string; step?: string }>
}) {
  const { t, locale } = await getTranslate()
  const { id } = await params
  const { gapdelta, step: stepParam } = await searchParams
  const application = getApplication(db, id)
  if (!application) notFound()

  // Re-checked at the point of use: the route stores whatever z.string().url()
  // accepted, and that includes schemes no href should ever carry.
  const postingUrl = safeHttpUrl(application.sourceUrl)

  const mappingOf = new Map(application.mappings.map((m) => [m.requirementId, m]))
  const copy = VERDICT_KEYS[application.coverage.verdict]

  // A verdict computed against yesterday's evidence base is stale, not wrong —
  // and a new role can turn a "skip" into a "worth it". Offer the re-map.
  const profile = getProfile(db)
  const evidence = profile ? listEvidence(db) : []
  const stale =
    profile !== null &&
    application.evidenceHash !== hashEvidenceProjection(buildEvidenceProjection(profile, evidence))

  const documents = application.documents as {
    cv?: unknown
    coverLetter?: unknown
    screening?: unknown
    recruiterMessage?: unknown
  } | null
  const savedCv = CVContentSchema.safeParse(documents?.cv)
  const savedReport = GroundingReportSchema.safeParse(application.groundingReport)
  const coverLetter = companionOf(CoverLetterSchema, documents?.coverLetter)
  const screening = companionOf(ScreeningSetSchema, documents?.screening)
  const recruiterMessage = companionOf(RecruiterMessageSchema, documents?.recruiterMessage)

  const facts = {
    status: application.status,
    coverage: application.coverage,
    hasCv: savedCv.success,
    outcomes: application.outcomes,
  }
  const current = currentStep(facts)
  const states = stepStates(facts)
  // A gap-fill run lands back on the gaps step, where its delta belongs.
  const step: Step = isStep(stepParam) ? stepParam : gapdelta ? 'gaps' : current
  const next = nextStep(step)
  const gapSelection = selectGaps(application.requirements, application.mappings)
  const hasGaps = gapSelection.primary.length > 0 || gapSelection.secondary.length > 0
  const archived = application.status === 'archived'
  // Mandatory first; within each group the uncovered ones lead, since those
  // are the reason to read the list at all.
  const ORDER = { none: 0, partial: 1, strong: 2 } as const
  const sortedRequirements = [...application.requirements].sort(
    (a, b) =>
      Number(b.mandatory) - Number(a.mandatory) ||
      ORDER[mappingOf.get(a.id)?.strength ?? 'none'] -
        ORDER[mappingOf.get(b.id)?.strength ?? 'none'],
  )

  const nextHref = (target: Step | null) =>
    target ? `/application/${application.id}?step=${target}` : ''

  return (
    <main id="main" tabIndex={-1} className="page">
      <p className="eyebrow">{t('application.eyebrow')}</p>
      <h1 className="app-title" style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
        {application.jobTitle}
        {/* Its own line rather than a trailing interpunct: when the title
            wraps, a leading " · " reads as a stray bullet. */}
        {application.company.trim() && (
          <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 400 }}>
            {application.company}
          </span>
        )}
      </h1>
      <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
        {t(`market.${application.market}`)}
        {'  ·  '}
        {t(`docLang.${application.documentLanguage}`)}
        {'  ·  '}
        {t(`status.${application.status}`)}
        {/* Weeks later the posting is the one thing you cannot reconstruct
            from this page: the stored text is what was analysed, but the live
            listing is what a recruiter will ask you about. rel=noreferrer
            because this is a third-party link the user pasted. */}
        {postingUrl && (
          <>
            {'  ·  '}
            <a href={postingUrl} target="_blank" rel="noreferrer noopener" className="action">
              {t('application.openPosting')}
            </a>
          </>
        )}
      </p>

      <FocusOnStep step={step} />
      <StepNav
        applicationId={application.id}
        active={step}
        current={current}
        states={states}
        t={t}
      />

      {step === 'decide' && (
        <section
          className="step-enter"
          id="step-content"
          tabIndex={-1}
          aria-label={t('steps.decide')}
        >
          {stale && <Reanalyse postingRaw={application.postingRaw} market={application.market} />}

          <div style={{ marginTop: 'var(--space-6)' }}>
            <CoverageBar coverage={application.coverage} />
          </div>

          {/* The verdict leads here exactly as it led on the card that produced
              it. It is the answer to the only question this step settles. */}
          <p className="eyebrow" style={{ marginTop: 'var(--space-6)' }}>
            {t('verdict.eyebrow')}
          </p>
          <p
            style={{
              font: 'var(--type-h4)',
              color: VERDICT_COLOR[application.coverage.verdict],
              marginTop: 'var(--space-2)',
            }}
          >
            {t(copy.label)}
          </p>
          <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-2)' }}>{t(copy.detail)}</p>

          {application.coverage.hardBlockers.length > 0 && (
            <div
              style={{
                border: '1px solid var(--signal-error)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginTop: 'var(--space-6)',
              }}
            >
              <p className="fact-label" style={{ color: 'var(--signal-error)' }}>
                {t('verdict.blocked')}
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 'var(--space-3) 0 0',
                  display: 'grid',
                  gap: 'var(--space-2)',
                }}
              >
                {application.coverage.hardBlockers.map((b) => (
                  <li key={b.id} style={{ color: 'var(--text-body)', font: 'var(--type-body-sm)' }}>
                    <span className="fact-label" style={{ marginRight: 'var(--space-2)' }}>
                      {t(`kind.${b.kind}`)}
                    </span>
                    {b.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The decision only exists before sending; afterwards these two
              buttons would ask a question that has already been answered. */}
          {application.outcomes.length === 0 && (
            <DecideActions
              applicationId={application.id}
              archived={archived}
              nextHref={nextHref(hasGaps ? 'gaps' : 'docs')}
              nextLabel={t(hasGaps ? 'decide.pursueGaps' : 'decide.pursueDocs')}
            />
          )}

          <section style={{ marginTop: 'var(--space-8)' }}>
            <p className="eyebrow">{t('application.requirements')}</p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 'var(--space-4) 0 0',
                display: 'grid',
                gap: 'var(--space-3)',
                maxWidth: '72ch',
              }}
            >
              {sortedRequirements.map((r) => {
                const m = mappingOf.get(r.id)
                const strength = m?.strength ?? 'none'
                return (
                  <li
                    key={r.id}
                    style={{
                      borderLeft: `2px solid ${STRENGTH_COLOR[strength]}`,
                      paddingLeft: 'var(--space-3)',
                    }}
                  >
                    <p className="fact" style={{ color: 'var(--text-strong)' }}>
                      {r.keyword}
                      <span style={{ color: 'var(--text-muted)' }}>
                        {'  ·  '}
                        {t(`kind.${r.kind}`)}
                        {'  ·  '}
                        {t(r.mandatory ? 'application.required' : 'application.preferred')}
                        {'  ·  '}
                        {/* Same colour as the rule beside it: the word and the
                            mark say one thing, so they should not say it differently. */}
                        <span style={{ color: STRENGTH_COLOR[strength] }}>
                          {t(`strengthOf.${strength}`)}
                        </span>
                      </span>
                    </p>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        font: 'var(--type-body-sm)',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      {m?.rationale || r.text}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>
        </section>
      )}

      {step === 'gaps' && (
        <section
          className="step-enter"
          id="step-content"
          tabIndex={-1}
          aria-label={t('steps.gaps')}
          style={{ maxWidth: '44em' }}
        >
          <h2 style={{ font: 'var(--type-h3)', marginTop: 'var(--space-6)' }}>{t('gaps.title')}</h2>
          <GapEntry
            t={t}
            applicationId={application.id}
            coverage={application.coverage}
            requirements={application.requirements}
            mappings={application.mappings}
            gapdelta={gapdelta}
            showLink={false}
          />
          {hasGaps && profile ? (
            <>
              <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-4)' }}>
                {t('gaps.lede')}
              </p>
              <GapFill
                applicationId={application.id}
                selection={gapSelection}
                roles={profile.experience}
                postingRaw={application.postingRaw}
                market={application.market}
              />
            </>
          ) : (
            <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-4)' }}>
              {t('steps.noGaps')}
            </p>
          )}
        </section>
      )}

      {step === 'docs' && (
        <section
          className="step-enter"
          id="step-content"
          tabIndex={-1}
          aria-label={t('steps.docs')}
          style={{ marginTop: 'var(--space-6)' }}
        >
          <Workspace
            applicationId={application.id}
            company={application.company}
            documentLanguage={application.documentLanguage}
            evidence={evidence}
            sourceLabels={sourceLabels(evidence, profile)}
            initialCv={savedCv.success ? savedCv.data : null}
            initialCvReport={savedReport.success ? savedReport.data : null}
            initialCoverLetter={coverLetter}
            initialScreening={screening}
            initialRecruiterMessage={recruiterMessage}
          />
        </section>
      )}

      {step === 'send' && (
        <section
          className="step-enter"
          id="step-content"
          tabIndex={-1}
          aria-label={t('steps.send')}
          style={{ marginTop: 'var(--space-6)', maxWidth: '44em' }}
        >
          <h2 style={{ font: 'var(--type-h3)' }}>{t('send.title')}</h2>
          <ol className="checklist">
            <li className={savedCv.success ? 'is-done' : ''}>
              {savedCv.success ? (
                <>
                  {t('send.cvReady')}{' '}
                  <a
                    href={`/api/export/pdf?applicationId=${application.id}`}
                    className="action"
                    download
                  >
                    PDF
                  </a>{' '}
                  ·{' '}
                  <a
                    href={`/api/export/docx?applicationId=${application.id}`}
                    className="action"
                    download
                  >
                    DOCX
                  </a>
                </>
              ) : (
                <>
                  {t('send.cvMissing')}{' '}
                  <a href={nextHref('docs')} className="action">
                    {t('steps.docs')}
                  </a>
                </>
              )}
            </li>
            <li className={coverLetter ? 'is-done' : ''}>
              {coverLetter ? t('send.letterReady') : t('send.letterOptional')}
            </li>
            <li>
              {postingUrl ? (
                <>
                  {t('send.applyAt')}{' '}
                  <a href={postingUrl} target="_blank" rel="noreferrer noopener" className="action">
                    {t('application.openPosting')}
                  </a>
                </>
              ) : (
                t('send.applyNoLink')
              )}
            </li>
          </ol>
          <div style={{ marginTop: 'var(--space-6)' }}>
            {application.outcomes.length > 0 ? (
              <p className="fact">{t('send.alreadySent')}</p>
            ) : (
              <OutcomeButtons applicationId={application.id} status={application.status} />
            )}
          </div>
        </section>
      )}

      {step === 'track' && (
        <section
          className="step-enter"
          id="step-content"
          tabIndex={-1}
          aria-label={t('steps.track')}
          style={{ marginTop: 'var(--space-6)', maxWidth: '44em' }}
        >
          <h2 style={{ font: 'var(--type-h3)' }}>{t('track.title')}</h2>
          {application.outcomes.length > 0 ? (
            <Timeline outcomes={application.outcomes} t={t} locale={locale} />
          ) : (
            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
              {t('track.empty')}
            </p>
          )}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <OutcomeButtons
              applicationId={application.id}
              status={application.status}
              extra={application.status === 'applied' ? ['ghosted'] : []}
            />
          </div>
        </section>
      )}

      {next && (
        <p style={{ marginTop: 'var(--space-9)' }}>
          <a href={nextHref(next)} className="action">
            {t('steps.next', { step: t(`steps.${next}`) })}
          </a>
        </p>
      )}

      {/* Destructive, so it lives on the last step only — not under every screen. */}
      {step === 'track' && <DeleteApplication applicationId={application.id} />}
    </main>
  )
}
