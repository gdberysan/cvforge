/**
 * The CV writer against the real model: the one paid core no other check
 * exercises (`npm run eval` covers the analysis only, and the suite stubs the
 * model). For each snapshotted application it writes a CV the way the
 * Generar button does, saves nothing, and measures in code:
 *
 * - truth: what the full pipeline still ships flagged after its own repairs
 *   (unverified figures, bad citations, claimed gaps, unsupported claims, and
 *   the model check's distortions);
 * - coverage: of the posting's mandatory requirements the record strongly supports,
 *   how many the CV actually says (keyword or variant, whole word);
 * - shape: estimated pages, the share of bullets carrying a figure, and for a
 *   title the person held, whether the summary opens with it.
 *
 * Costs real money (≈ $0.25–0.50 per fixture: compose, a repair at most,
 * the distortion check). Needs CVFORGE_DB_PATH on a scratch copy of a real
 * install and CVFORGE_CONFIG_PATH on its config.json (see CLAUDE.md). Every
 * run is appended to evals/private/cv-runs.jsonl and compared with the last.
 *
 *   npm run eval:cv              # every fixture
 *   npm run eval:cv -- <id>      # one fixture
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { type ComposeStage, composeAndVerify } from '@/lib/ai/compose'
import { modelFor } from '@/lib/ai/config'
import { postingVocabularyOf } from '@/lib/ai/distortions'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { apiCalls } from '@/lib/db/schema'
import { type CvRun, cvMetrics, cvText, regressions } from '@/lib/evals/cv'

const DIR = path.join(process.cwd(), 'evals', 'private', 'fixtures')
const RUNS = path.join(process.cwd(), 'evals', 'private', 'cv-runs.jsonl')
const OUT = path.join(process.cwd(), 'evals', 'private', 'cv-out')
const only = process.argv[2]

const ids: string[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)))
  .map((f) => (JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as { id: string }).id)

const profile = getProfile(db)
if (!profile) {
  console.error('eval:cv: no profile in the database.')
  process.exit(2)
}
const evidence = listEvidence(db)
const spent = () =>
  db
    .select({ s: sql<number>`coalesce(sum(${apiCalls.costUsd}), 0)` })
    .from(apiCalls)
    .get()?.s ?? 0

const previous = new Map<string, CvRun>()
if (existsSync(RUNS)) {
  for (const line of readFileSync(RUNS, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const run = JSON.parse(line) as CvRun
    previous.set(run.fixture, run)
  }
}

console.log(`eval:cv: compose on ${modelFor('compose-cv')}, ${ids.length} fixture(s)`)
let failed = 0
let total = 0
for (const id of ids) {
  const application = getApplication(db, id)
  if (!application || application.requirements.length === 0) {
    console.log(`\n${id}: not in this database, or never analysed — skipped`)
    continue
  }
  const stages: ComposeStage[] = []
  const before = spent()
  const started = Date.now()
  const { cv, report } = await composeAndVerify({
    reasonLanguage: 'es',
    profile,
    requirements: application.requirements,
    mappings: application.mappings,
    evidence,
    language: application.documentLanguage,
    market: application.market,
    company: application.company,
    jobTitle: application.jobTitle,
    postingVocabulary: postingVocabularyOf(application.requirements),
    onProgress: (s) => stages.push(s),
  })
  const costUsd = spent() - before
  total += costUsd
  const m = cvMetrics({ cv, report, profile, application })
  const run: CvRun = {
    at: new Date().toISOString(),
    model: modelFor('compose-cv'),
    fixture: id,
    company: application.company,
    ...m,
    repaired: stages.includes('repairing'),
    refined: stages.includes('refining'),
    seconds: Math.round((Date.now() - started) / 1000),
    costUsd: Number(costUsd.toFixed(4)),
  }
  appendFileSync(RUNS, `${JSON.stringify(run)}\n`)
  // The CV itself, to read: private, beside the runs.
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${id}.txt`), cvText(cv))

  const worse = regressions(previous.get(id), run)
  const ok = run.flags === 0 && run.coverage >= 0.8 && worse.length === 0
  if (!ok) failed++
  console.log(`\n${application.company || '(no company)'} — ${application.jobTitle}`)
  console.log(
    `  ${ok ? 'OK   ' : 'CHECK'} flags=${run.flags} coverage=${run.coverage.toFixed(2)} (${run.covered}/${run.supported}, exact ${run.atsCovered}) pages=${run.pages} figures=${run.figureShare.toFixed(2)}${run.heldTitle === null ? '' : ` heldTitle=${run.heldTitle}`}  $${run.costUsd} ${run.seconds}s${run.repaired ? ' repaired' : ''}${run.refined ? ' refined' : ''}`,
  )
  for (const f of run.flagged) console.log(`    flagged: ${f}`)
  if (run.missing.length) console.log(`    supported but not said: ${run.missing.join(', ')}`)
  for (const w of worse) console.log(`    worse than last run: ${w}`)
}
console.log(
  `\neval:cv: ${ids.length} fixture(s), ${failed} to check, $${total.toFixed(2)}. Runs logged to evals/private/cv-runs.jsonl.`,
)
process.exit(failed > 0 ? 1 : 0)
