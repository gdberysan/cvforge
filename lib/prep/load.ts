import type { Db } from '@/lib/db/client'
import { getApplication, listOutcomes } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { listPeople } from '@/lib/db/queries/people'
import { listAnswers } from '@/lib/db/queries/prep'
import { getProfile } from '@/lib/db/queries/profile'
import type { DocumentLanguage } from '@/lib/schemas'
import type { PrepInput } from './context'

/** Everything a prep is built from, read from the store. Null when the application or profile is missing. */
export function loadPrepInput(
  db: Db,
  applicationId: string,
  language?: DocumentLanguage,
  eventId?: string,
): PrepInput | null {
  const app = getApplication(db, applicationId)
  const profile = getProfile(db)
  if (!app || !profile) return null
  return {
    application: {
      id: app.id,
      company: app.company,
      jobTitle: app.jobTitle,
      documentLanguage: app.documentLanguage,
      requirements: app.requirements,
      mappings: app.mappings,
      documents: app.documents,
      groundingReport: app.groundingReport,
      outcomes: listOutcomes(db, app.id),
    },
    profile,
    evidence: listEvidence(db),
    people: listPeople(db, app.id),
    answers: listAnswers(db, app.id),
    ...(language ? { language } : {}),
    ...(eventId ? { eventId } : {}),
  }
}
