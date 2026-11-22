import { redirect } from 'next/navigation'
import { EvidenceView } from '@/components/pages/EvidenceView'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadEvidence } from '@/lib/pages/evidence'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran.
 */
export const dynamic = 'force-dynamic'

export default async function EvidencePage() {
  const { t } = await getTranslate()
  const data = loadEvidence(db)
  // With no profile there is nothing to show and only one thing to do, and the
  // home page already is that thing. A second empty state inviting you to
  // import would be a second front door.
  if (!data) redirect('/')
  return <EvidenceView data={data} t={t} />
}
