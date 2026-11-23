/** Everything the Experiencia screen reads (see lib/pages/home.ts). */
import type { Db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { listInterviewSessions } from '@/lib/db/queries/interview-sessions'
import { getProfile } from '@/lib/db/queries/profile'
import { computeProfileStrength } from '@/lib/strength'

export function loadEvidence(db: Db) {
  const profile = getProfile(db)
  // No profile: nothing to show, and the home page is the one thing to do.
  if (!profile) return null

  const evidence = listEvidence(db)
  const strength = computeProfileStrength(profile, evidence)

  return {
    profile,
    evidence,
    interviewSessions: listInterviewSessions(db),
    strength,
  }
}

export type EvidenceData = NonNullable<ReturnType<typeof loadEvidence>>
