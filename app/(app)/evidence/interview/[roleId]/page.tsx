import { notFound } from 'next/navigation'
import { InterviewPanel } from '@/components/evidence/InterviewPanel'
import { db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { getTranslate } from '@/lib/i18n/server'
import { splitEvidenceForInterview } from '@/lib/interview/split'

export default async function InterviewPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { t } = await getTranslate()
  const { roleId } = await params
  const profile = getProfile(db)
  const role = profile?.experience.find((r) => r.id === roleId)
  if (!profile || !role) notFound()

  // Only import-origin scaffolding counts as stubs. Interviewed and manual
  // records are real evidence, and accepting an interview never deletes them.
  const { stubs, existing } = splitEvidenceForInterview(listEvidence(db), role.id)

  return (
    <main className="page page-narrow">
      <p className="eyebrow">{t('interview.eyebrow')}</p>
      <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
        {role.title}
        {/* The company goes on its own line rather than trailing an interpunct:
            when the title wraps, a leading " · " reads as a stray bullet. */}
        <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 400 }}>
          {role.company}
        </span>
      </h1>
      <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
        {role.period.start} → {role.period.end ?? t('evidence.present')}
      </p>

      <div style={{ marginTop: 'var(--space-7)' }}>
        <InterviewPanel role={role} stubs={stubs} existingCount={existing.length} />
      </div>
    </main>
  )
}
