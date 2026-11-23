import { GapFill } from '@/components/application/GapFill'
import { ImportReview } from '@/components/evidence/ImportReview'
import { InterviewPanel } from '@/components/evidence/InterviewPanel'
import { BackLink } from '@/components/ui/BackLink'
import { Meta } from '@/components/ui/Meta'
import { VariantsManager } from '@/components/variants/VariantsManager'
import { companyName } from '@/lib/company-name'
import type { Translate } from '@/lib/i18n'
import type { CvsData, GapsData, ImportData, InterviewData } from '@/lib/pages/small'
import { periodLabel } from '@/lib/period'

/** Base CVs, from lib/pages/small.ts's data. */
export function CvsView({ data, t }: { data: CvsData; t: Translate }) {
  return (
    <main id="main" tabIndex={-1} className="page">
      <BackLink href="/evidence" label={t('nav.evidence')} />
      <p className="eyebrow">{t('variants.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>{t('variants.title')}</h1>
      <p className="prose" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {t('variants.lede')}
      </p>
      <VariantsManager
        variants={data.variants}
        currentEvidenceHash={data.currentEvidenceHash}
        ownMarkets={data.ownMarkets}
      />
    </main>
  )
}

/** CV re-import: the same shape as the first-run import screen. */
export function ImportView({ data, t }: { data: ImportData; t: Translate }) {
  return (
    <main id="main" tabIndex={-1} className="page">
      <BackLink href="/evidence" label={t('nav.evidence')} />
      <div className="hero">
        <div className="hero-intro">
          <p className="eyebrow">{t('import.eyebrow')}</p>
          <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
            {t('import.title')}
          </h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            {t('import.lede')}
          </p>
          {data.hasProfile && (
            // The contract, stated before the parse is paid for — not only at
            // the accept step's armed confirm.
            <p
              className="prose"
              style={{ marginTop: 'var(--space-3)', font: 'var(--type-body-sm)' }}
            >
              {t('import.reimportNote')}
            </p>
          )}
        </div>
        <ImportReview hasProfile={data.hasProfile} />
      </div>
    </main>
  )
}

/** One role's interview. */
export function InterviewView({ data, t }: { data: InterviewData; t: Translate }) {
  const { role } = data
  return (
    <main id="main" tabIndex={-1} className="page">
      <BackLink href="/evidence" label={t('nav.evidence')} />
      <header className="page-head">
        <p className="eyebrow">{t('interview.eyebrow')}</p>
        <h1 className="page-title">{role.title}</h1>
        <p className="page-lede">
          <Meta>
            {companyName(role.company)}
            {periodLabel(
              role.period.start,
              role.period.end,
              t('intl.locale'),
              t('evidence.present'),
            )}
          </Meta>
        </p>
      </header>
      <section className="board">
        <InterviewPanel role={role} stubs={data.stubs} existingCount={data.existingCount} />
      </section>
    </main>
  )
}

/** Gap-fill for one application. */
export function GapsView({ data, t }: { data: GapsData; t: Translate }) {
  const { application } = data
  const company = companyName(application.company)
  return (
    <main id="main" tabIndex={-1} className="page">
      <BackLink href={`/application/${application.id}`} label={application.jobTitle} />
      <header className="page-head">
        <p className="eyebrow">{t('gaps.eyebrow')}</p>
        <h1 className="page-title">{t('gaps.title')}</h1>
        <p className="page-lede">
          <Meta>
            {application.jobTitle}
            {company}
          </Meta>
        </p>
      </header>
      <section className="board">
        <p className="story-lede">{t('gaps.lede')}</p>
        <GapFill
          applicationId={application.id}
          selection={data.selection}
          roles={data.roles}
          postingRaw={application.postingRaw}
          market={application.market}
        />
      </section>
    </main>
  )
}
