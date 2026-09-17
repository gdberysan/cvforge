import { notFound } from 'next/navigation'
import { z } from 'zod'
import { DeleteApplication } from '@/components/application/DeleteApplication'
import { GapEntry } from '@/components/application/GapEntry'
import { Reanalyse } from '@/components/application/Reanalyse'
import { Workspace } from '@/components/studio/Workspace'
import { CoverageBar } from '@/components/triage/CoverageBar'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { VERDICT_COLOR, VERDICT_KEYS } from '@/lib/coverage'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
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
  partial: 'var(--graphite-200)',
  none: 'var(--signal-error)',
} as const

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gapdelta?: string }>
}) {
  const { t } = await getTranslate()
  const { id } = await params
  const { gapdelta } = await searchParams
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

  return (
    <main className="page">
      <p className="eyebrow">{t('application.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
        {application.jobTitle}
        {/* Its own line rather than a trailing interpunct: when the title
            wraps, a leading " · " reads as a stray bullet. */}
        <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 400 }}>
          {application.company}
        </span>
      </h1>
      <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
        {application.market}
        {'  ·  '}
        {application.documentLanguage}
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

      {stale && <Reanalyse postingRaw={application.postingRaw} market={application.market} />}

      <div style={{ marginTop: 'var(--space-7)' }}>
        <CoverageBar coverage={application.coverage} />
      </div>

      {/* The verdict leads here exactly as it led on the card that produced it.
          It is the answer to the only question this screen exists to settle. */}
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

      <section style={{ marginTop: 'var(--space-8)' }}>
        <p className="eyebrow">{t('application.requirements')}</p>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--space-4) 0 0',
            display: 'grid',
            gap: 'var(--space-3)',
          }}
        >
          {application.requirements.map((r) => {
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
                    {/* Same colour as the rule beside it: the word and the mark
                        say one thing, so they should not say it differently. */}
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

      <GapEntry
        t={t}
        applicationId={application.id}
        coverage={application.coverage}
        requirements={application.requirements}
        mappings={application.mappings}
        gapdelta={gapdelta}
      />

      {/* Honest about what is not built yet, rather than a button that goes nowhere. */}
      <section style={{ marginTop: 'var(--space-9)' }}>
        <p className="eyebrow">{t('studio.eyebrow')}</p>
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Workspace
            applicationId={application.id}
            company={application.company}
            documentLanguage={application.documentLanguage}
            evidence={evidence}
            initialCv={savedCv.success ? savedCv.data : null}
            initialCvReport={savedReport.success ? savedReport.data : null}
            initialCoverLetter={coverLetter}
            initialScreening={screening}
            initialRecruiterMessage={recruiterMessage}
          />
        </div>
      </section>

      <DeleteApplication applicationId={application.id} />
    </main>
  )
}
