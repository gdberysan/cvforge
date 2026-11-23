/**
 * What the smaller screens read (see lib/pages/home.ts): Base CVs, CV
 * re-import, a role's interview, and gap-fill for one application.
 */
import { currentStep } from '@/lib/application-steps'
import type { Db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { listVariants } from '@/lib/db/queries/cv-variants'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { selectGaps } from '@/lib/gaps/select'
import { splitEvidenceForInterview } from '@/lib/interview/split'
import { CVContentSchema } from '@/lib/schemas'
import { evidenceHashOf } from '@/lib/variants'

/** Base CVs; null when there is no profile (home is the one thing to do). */
export function loadCvs(db: Db) {
  const profile = getProfile(db)
  if (!profile) return null
  return {
    variants: listVariants(db),
    currentEvidenceHash: evidenceHashOf(profile, listEvidence(db)),
    ownMarkets: profile.preferences.markets,
  }
}
export type CvsData = NonNullable<ReturnType<typeof loadCvs>>

/** With a profile on file, accepting a new import is destructive and takes a second click. */
export function loadImport(db: Db) {
  return { hasProfile: Boolean(getProfile(db)) }
}
export type ImportData = ReturnType<typeof loadImport>

/** One role's interview; null when the role is not on file. */
export function loadInterview(db: Db, roleId: string) {
  const profile = getProfile(db)
  const role = profile?.experience.find((r) => r.id === roleId)
  if (!profile || !role) return null
  // Only import-origin scaffolding counts as stubs. Interviewed and manual
  // records are real evidence, and accepting an interview never deletes them.
  const { stubs, existing } = splitEvidenceForInterview(listEvidence(db), role.id)
  return { role, stubs, existingCount: existing.length }
}
export type InterviewData = NonNullable<ReturnType<typeof loadInterview>>

/**
 * Gap-fill for one application; null when it or the profile is missing, or
 * where to go instead when there is nothing left to write against.
 */
export function loadGaps(db: Db, id: string) {
  const application = getApplication(db, id)
  const profile = getProfile(db)
  if (!application || !profile) return null
  const selection = selectGaps(application.requirements, application.mappings)
  // Nothing to write against is not an empty screen — it is a finished job.
  if (selection.primary.length === 0 && selection.secondary.length === 0) {
    // To where the application is: named explicitly, since a bare link
    // opens the overview.
    const step = currentStep({
      status: application.status,
      coverage: application.coverage,
      hasCv: CVContentSchema.safeParse((application.documents as { cv?: unknown } | null)?.cv)
        .success,
      outcomes: application.outcomes,
    })
    return { redirect: `/application/${id}?step=${step}` } as const
  }
  return {
    redirect: null,
    application: {
      id: application.id,
      jobTitle: application.jobTitle,
      company: application.company,
      postingRaw: application.postingRaw,
      market: application.market,
    },
    selection,
    roles: profile.experience,
  } as const
}
export type GapsData = Extract<NonNullable<ReturnType<typeof loadGaps>>, { redirect: null }>
