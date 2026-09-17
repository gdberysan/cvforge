import type { Db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'

/**
 * Demo only: the seeded postings the paste box becomes a chooser for. Active
 * and skipped alike — the skipped one is the tool saying no, which the demo
 * is meant to show — in id order so the list reads the same on every page.
 */
export function demoPostings(db: Db): { id: string; label: string; text: string }[] {
  return listFullApplications(db, { archived: false })
    .concat(listFullApplications(db, { archived: true }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => ({ id: a.id, label: `${a.jobTitle} · ${a.company}`, text: a.postingRaw }))
}
