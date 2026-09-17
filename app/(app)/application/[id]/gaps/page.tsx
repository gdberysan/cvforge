import { notFound, redirect } from 'next/navigation'
import { GapFill } from '@/components/application/GapFill'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { selectGaps } from '@/lib/gaps/select'
import { getTranslate } from '@/lib/i18n/server'

export default async function GapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getTranslate()
  const { id } = await params
  const application = getApplication(db, id)
  const profile = getProfile(db)
  if (!application || !profile) notFound()

  const selection = selectGaps(application.requirements, application.mappings)

  // Nothing to write against is not an empty screen — it is a finished job.
  if (selection.primary.length === 0 && selection.secondary.length === 0) {
    redirect(`/application/${id}`)
  }

  return (
    <main className="page page-narrow">
      <p className="eyebrow">{t('gaps.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
        {t('gaps.title')}
        {/* Its own line rather than a trailing interpunct: when the heading
            wraps, a leading " · " reads as a stray bullet. */}
        <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 400 }}>
          {application.jobTitle} — {application.company}
        </span>
      </h1>
      <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-4)', maxWidth: '38em' }}>
        {t('gaps.lede')}
      </p>

      <GapFill
        applicationId={application.id}
        selection={selection}
        roles={profile.experience}
        postingRaw={application.postingRaw}
        market={application.market}
      />
    </main>
  )
}
