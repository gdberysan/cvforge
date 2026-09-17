/**
 * Snapshots every analysed application into evals/fixtures/ — the posting
 * text plus what the CURRENT prompts extracted and concluded. Run it after
 * you have judged an analysis good. `npm run eval` later re-runs the live
 * stages against these fixtures and diffs. Spec §12 gate 4.
 *
 * Never overwrites an existing fixture: a snapshot is a judgement, re-taken
 * deliberately by deleting the file first.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { hashEvidenceProjection } from '@/lib/hash'

export type EvalFixture = {
  id: string
  company: string
  jobTitle: string
  market: string
  snapshottedAt: string
  /** Mapping and verdict only mean something against the same evidence base. */
  evidenceHash: string
  postingText: string
  expected: {
    requirements: { keyword: string; kind: string; mandatory: boolean }[]
    verdict: string
    mandatoryStrong: number
    mandatoryPartial: number
    mandatoryMissing: number
  }
}

const DIR = path.join(process.cwd(), 'evals', 'private', 'fixtures')
mkdirSync(DIR, { recursive: true })

const profile = getProfile(db)
if (!profile) {
  console.error('eval-snapshot: no profile in the database.')
  process.exit(2)
}
const evidenceHash = hashEvidenceProjection(buildEvidenceProjection(profile, listEvidence(db)))

const apps = listFullApplications(db, { archived: false }).concat(
  listFullApplications(db, { archived: true }),
)

let written = 0
for (const app of apps) {
  const file = path.join(DIR, `${app.id}.json`)
  if (existsSync(file)) continue
  const fixture: EvalFixture = {
    id: app.id,
    company: app.company,
    jobTitle: app.jobTitle,
    market: app.market,
    snapshottedAt: new Date().toISOString(),
    evidenceHash,
    postingText: app.postingRaw,
    expected: {
      requirements: app.requirements.map((r) => ({
        keyword: r.keyword,
        kind: r.kind,
        mandatory: r.mandatory,
      })),
      verdict: app.coverage.verdict,
      mandatoryStrong: app.coverage.mandatoryStrong,
      mandatoryPartial: app.coverage.mandatoryPartial,
      mandatoryMissing: app.coverage.mandatoryMissing,
    },
  }
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`)
  written += 1
  console.log(`  + ${app.company} — ${app.jobTitle}`)
}

console.log(`eval-snapshot: ${written} new fixture(s), ${apps.length - written} already present.`)
