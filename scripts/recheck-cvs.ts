/**
 * `npm run recheck -- [--write]`
 *
 * Runs today's checks over every saved CV without writing a new one, and
 * prints what each would now be flagged for. A report saved by an older
 * checker goes stale: on 2026-10-17 most of the maintainer's 22 CVs showed
 * red for things the checker had simply not been shown (figures stored as
 * metrics, the role's employer, their own LinkedIn), which teaches the
 * person to ignore red. Dry by default; `--write` replaces each saved report.
 *
 * Paid: one low-effort model call per CV (≈ $0.07), recorded in api_calls
 * like any other. Needs CVFORGE_DB_PATH on a real install so the key
 * resolves beside it.
 */
import './load-env'
import { eq } from 'drizzle-orm'
import { recheckCv } from '@/lib/ai/compose'
import { postingVocabularyOf } from '@/lib/ai/distortions'
import { db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { applications } from '@/lib/db/schema'
import { CVContentSchema, type GroundingReport, GroundingReportSchema } from '@/lib/schemas'

function flags(r: GroundingReport): string[] {
  return [
    ...r.distortions.map((d) => `${d.bulletId}: ${d.reason}`),
    ...r.unverifiedNumbers.map((n) => `${n.bulletId}: unverified figure ${n.token}`),
    ...r.claimedGaps.map((g) => `${g.bulletId}: claims the gap "${g.keyword}"`),
    ...r.unsupportedClaims.map((c) => `${c.bulletId}: "${c.text}" is on no record`),
    ...r.invalidCitations.map((c) => `${c.bulletId}: cites ${c.evidenceId}`),
    ...r.uncitedBullets.map((b) => `${b}: cites nothing`),
  ]
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const profile = getProfile(db)
  if (!profile) throw new Error('No profile in this database.')
  const evidence = listEvidence(db)
  const all = [
    ...listFullApplications(db, { archived: false }),
    ...listFullApplications(db, { archived: true }),
  ]
  for (const a of all) {
    const raw = (a.documents as { cv?: unknown } | null)?.cv
    const cv = CVContentSchema.safeParse(raw)
    if (!cv.success) continue
    const before = GroundingReportSchema.safeParse(a.groundingReport)
    const report = await recheckCv(cv.data, {
      profile,
      requirements: a.requirements,
      mappings: a.mappings,
      evidence,
      jobTitle: a.jobTitle,
      postingVocabulary: postingVocabularyOf(a.requirements),
      reasonLanguage: 'es',
      legacySummary: typeof raw === 'object' && raw !== null && !('summaryCitedEvidenceIds' in raw),
    })
    const was = before.success
      ? before.data.passed
        ? 'passed'
        : `${flags(before.data).length} flag(s)`
      : 'no report'
    const now = report.passed ? 'passed' : `${flags(report).length} flag(s)`
    console.log(`\n${a.company || '(no company)'} — ${a.jobTitle}\n  was: ${was} → now: ${now}`)
    for (const f of flags(report)) console.log(`  - ${f}`)
    if (write) {
      db.update(applications)
        .set({ groundingReport: report })
        .where(eq(applications.id, a.id))
        .run()
    }
  }
  console.log(write ? '\nSaved reports replaced.' : '\nDry run: nothing written (add --write).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
