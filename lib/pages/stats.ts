/** What Números reads (see lib/pages/home.ts); the figures are computed in the view. */
import type { Db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { toStatApp } from '@/lib/stats'

export function loadStats(db: Db) {
  // Historical rates read everything ever triaged; "waiting on a human" reads
  // only what is still active — an application skipped into the archive is
  // not waiting on anyone, and the pipeline computes over the same set.
  return {
    active: listFullApplications(db, { archived: false }).map(toStatApp),
    archived: listFullApplications(db, { archived: true }).map(toStatApp),
    evidence: listEvidence(db),
    profile: getProfile(db),
  }
}

export type StatsData = ReturnType<typeof loadStats>
