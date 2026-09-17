/**
 * Prompt regression evals — spec §12 gate 4. Re-runs the LIVE triage stages
 * on every snapshotted posting and diffs extraction against the snapshot, so
 * a prompt change can be judged better rather than merely different.
 *
 * Costs real money (≈ $0.13 per fixture at current prices: extraction plus
 * mapping). Every run is appended to evals/runs.jsonl, because a single run
 * cannot separate a prompt regression from sampling noise — the baseline on
 * 2026-08-21 showed the SAME prompt re-extracting the same posting at
 * jaccard 0.71 overall, mostly churn in soft requirements. So the judged set
 * is the one that moves verdicts: mandatory requirements of non-soft kinds.
 * The all-keyword figure is printed for information.
 *
 *   npm run eval              # all fixtures
 *   npm run eval -- <id>      # one fixture
 */
import './load-env'
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { modelFor } from '@/lib/ai/config'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { runTriage } from '@/lib/ai/triage'
import { db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { compareExtraction, type ReqSnapshot } from '@/lib/evals/compare'
import { hashEvidenceProjection } from '@/lib/hash'
import type { EvalFixture } from './eval-snapshot'

const DIR = path.join(process.cwd(), 'evals', 'private', 'fixtures')
const RUNS = path.join(process.cwd(), 'evals', 'private', 'runs.jsonl')
const only = process.argv[2]

console.log(
  `eval: extract-requirements on ${modelFor('extract-requirements')}, map-evidence on ${modelFor('map-evidence')}`,
)

const fixtures: EvalFixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')))

if (fixtures.length === 0) {
  console.error(
    'eval: no fixtures. Run `npm run eval:snapshot` after analysing some postings (they land in evals/private/).',
  )
  process.exit(2)
}

const profile = getProfile(db)
if (!profile) {
  console.error('eval: no profile in the database.')
  process.exit(2)
}
const evidence = listEvidence(db)
const evidenceHash = hashEvidenceProjection(buildEvidenceProjection(profile, evidence))

/** Judged floor on the hard-mandatory set. Calibrated against evals/runs.jsonl. */
const HARD_JACCARD_FLOOR = 0.7

const hardMandatory = (list: ReqSnapshot[]) => list.filter((r) => r.mandatory && r.kind !== 'soft')

let failures = 0
for (const fx of fixtures) {
  process.stdout.write(`\n${fx.company} — ${fx.jobTitle}\n`)
  const result = await runTriage({ postingText: fx.postingText, profile, evidence })
  const actual: ReqSnapshot[] = result.requirements.map((r) => ({
    keyword: r.keyword,
    kind: r.kind,
    mandatory: r.mandatory,
  }))

  const all = compareExtraction(fx.expected.requirements, actual)
  const hard = compareExtraction(hardMandatory(fx.expected.requirements), hardMandatory(actual))
  const sameEvidence = fx.evidenceHash === evidenceHash
  const c = result.coverage
  const verdictMoved = sameEvidence && c.verdict !== fx.expected.verdict

  const ok = hard.jaccard >= HARD_JACCARD_FLOOR && hard.mandatoryFlips.length === 0 && !verdictMoved
  if (!ok) failures += 1

  console.log(
    `  hard-mandatory ${ok ? 'OK   ' : 'DRIFT'}  jaccard=${hard.jaccard.toFixed(2)}  matched=${hard.matched}`,
  )
  if (hard.missing.length) console.log(`    missing:  ${hard.missing.join(', ')}`)
  if (hard.added.length) console.log(`    added:    ${hard.added.join(', ')}`)
  for (const r of hard.renamed) console.log(`    reworded: ${r.was} → ${r.now}`)
  for (const k of hard.kindFlips) console.log(`    kind flip: ${k.keyword} ${k.was} → ${k.now}`)
  console.log(
    `  all keywords (info)   jaccard=${all.jaccard.toFixed(2)}  matched=${all.matched}  missing=${all.missing.length}  added=${all.added.length}`,
  )
  if (all.mandatoryFlips.length)
    console.log(`    mandatory flips: ${all.mandatoryFlips.join(', ')}`)

  const verdictLine = `verdict ${fx.expected.verdict} → ${c.verdict}  (mandatory ${c.mandatoryStrong}/${c.mandatoryPartial}/${c.mandatoryMissing} vs ${fx.expected.mandatoryStrong}/${fx.expected.mandatoryPartial}/${fx.expected.mandatoryMissing})`
  console.log(
    `  ${sameEvidence ? '' : '(evidence changed since snapshot — informational) '}${verdictLine}`,
  )
  if (verdictMoved) console.log('    VERDICT CHANGED on the same evidence')

  appendFileSync(
    RUNS,
    `${JSON.stringify({
      at: new Date().toISOString(),
      models: {
        extract: modelFor('extract-requirements'),
        map: modelFor('map-evidence'),
      },
      fixture: fx.id,
      company: fx.company,
      hardJaccard: hard.jaccard,
      hardMissing: hard.missing,
      hardAdded: hard.added,
      allJaccard: all.jaccard,
      allMissing: all.missing,
      allAdded: all.added,
      hardRenamed: hard.renamed,
      mandatoryFlips: all.mandatoryFlips,
      verdict: c.verdict,
      expectedVerdict: fx.expected.verdict,
      sameEvidence,
      ok,
    })}\n`,
  )
}

console.log(
  `\neval: ${fixtures.length} fixture(s), ${failures} drifted. Runs logged to evals/private/runs.jsonl.`,
)
process.exit(failures > 0 ? 1 : 0)
