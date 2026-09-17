import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AddRole } from '@/components/evidence/AddRole'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import { Rail, type RoleIndexItem } from '@/components/evidence/Rail'
import { db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { listInterviewSessions } from '@/lib/db/queries/interview-sessions'
import { getProfile } from '@/lib/db/queries/profile'
import { getTranslate } from '@/lib/i18n/server'
import { computeProfileStrength, roleHealth } from '@/lib/strength'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran.
 */
export const dynamic = 'force-dynamic'

export default async function EvidencePage() {
  const { t } = await getTranslate()
  const profile = getProfile(db)

  // With no profile there is nothing to show and only one thing to do, and the
  // home page already is that thing. A second empty state inviting you to
  // import would be a second front door.
  if (!profile) redirect('/')

  const evidence = listEvidence(db)
  const interviewSessions = listInterviewSessions(db)
  const strength = computeProfileStrength(profile, evidence)

  // The same health reading the editor renders per section, condensed for the
  // rail's at-a-glance index.
  const roles: RoleIndexItem[] = profile.experience.map((role) => ({
    id: role.id,
    title: role.title,
    company: role.company,
    ...roleHealth(evidence, role.id),
  }))

  return (
    <main className="page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <p className="eyebrow">{t('evidence.eyebrow')}</p>
        {/* Re-import was reachable only by typing the URL. */}
        <Link href="/evidence/import" className="action">
          {t('evidence.importLink')}
        </Link>
      </div>
      <div className="work-shell" style={{ marginTop: 'var(--space-4)' }}>
        <Rail strength={strength} roles={roles} t={t} />
        <div className="work">
          <EvidenceEditor
            profile={profile}
            evidence={evidence}
            interviewSessions={interviewSessions}
          />
          <AddRole />
        </div>
      </div>
    </main>
  )
}
