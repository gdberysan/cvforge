/**
 * Freezes the demo (product spec §5.3). Runs the REAL pipeline once, with the
 * author's key, on a temporary database — never data/cvforge.db — and writes
 * demo/seed.json + demo/pdf/*. ≈ $2. Review the output by hand before
 * committing: it is content.
 *
 *   npm run demo:build
 */
import './load-env'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  PERSONA_EVIDENCE,
  PERSONA_OUTCOMES,
  PERSONA_POSTINGS,
  PERSONA_PROFILE,
} from '@/demo/persona'
import { composeAndVerifyCompanion } from '@/lib/ai/companion'
import { composeAndVerify } from '@/lib/ai/compose'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { setSpendRecorder } from '@/lib/ai/spend-hook'
import { planInterview } from '@/lib/ai/stages/interview'
import { runTriage } from '@/lib/ai/triage'
import { openDb, runMigrations } from '@/lib/db/client'
import { listAnswers, upsertAnswer } from '@/lib/db/queries/answers'
import {
  appendOutcome,
  createApplication,
  getApplication,
  mergeDocuments,
  saveDocuments,
  setArchived,
} from '@/lib/db/queries/applications'
import { listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import { recordApiCall, spendSummary } from '@/lib/db/queries/spend'
import type { Seed } from '@/lib/demo/seed'
import { hashEvidenceProjection, hashPosting } from '@/lib/hash'
import { renderCvHtml } from '@/lib/render/cv-html'
import { isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'
import type { ScreeningSet } from '@/lib/schemas'

const OUT = path.join(process.cwd(), 'demo')
const tmp = mkdtempSync(path.join(tmpdir(), 'cvforge-demo-build-'))
const { db, close } = openDb(path.join(tmp, 'build.db'))
runMigrations(db)
// Spend lands in the temp database so the build can report what it cost.
setSpendRecorder((record) => recordApiCall(db, record))

try {
  saveProfile(db, PERSONA_PROFILE)
  PERSONA_EVIDENCE.forEach((e, i) => {
    upsertEvidence(db, e, i)
  })
  const profile = getProfile(db)
  if (!profile) throw new Error('profile did not save')
  const evidence = listEvidence(db)
  const evidenceHash = hashEvidenceProjection(buildEvidenceProjection(profile, evidence))

  // ① + ② for each posting.
  for (const p of PERSONA_POSTINGS) {
    process.stdout.write(`triage ${p.id}… `)
    const r = await runTriage({ postingText: p.text, profile, evidence })
    createApplication(db, {
      id: p.id,
      source: p.source,
      company: r.company,
      jobTitle: r.jobTitle,
      market: p.market,
      documentLanguage: r.language,
      postingRaw: p.text,
      postingHash: hashPosting(p.text),
      evidenceHash,
      requirements: r.requirements,
      mappings: r.mappings,
      coverage: r.coverage,
    })
    console.log(`${r.coverage.verdict} (expected ${p.expectedVerdict})`)
  }

  // Kits for the two non-skip postings.
  const vocab = (reqs: { keyword: string; variants: string[] }[]) =>
    new Set(reqs.flatMap((r) => [r.keyword, ...r.variants]).map((v) => v.toLowerCase()))

  for (const id of ['app_demo_1', 'app_demo_2'] as const) {
    const app = getApplication(db, id)
    if (!app) throw new Error(`${id} missing`)
    const base = {
      profile,
      requirements: app.requirements,
      mappings: app.mappings,
      evidence,
      language: app.documentLanguage,
      company: app.company,
      jobTitle: app.jobTitle,
    }
    process.stdout.write(`compose cv ${id}… `)
    const { cv, report } = await composeAndVerify({
      ...base,
      market: app.market,
      companyTone: '',
      postingVocabulary: vocab(app.requirements),
    })
    saveDocuments(db, id, { cv }, report)
    console.log(report.passed ? 'verified' : `flags: ${JSON.stringify(report)}`)

    process.stdout.write(`cover letter ${id}… `)
    const cl = await composeAndVerifyCompanion('coverLetter', base)
    mergeDocuments(db, id, { coverLetter: cl })
    console.log(cl.report.passed ? 'verified' : 'flagged')

    if (id === 'app_demo_1') {
      process.stdout.write('screening + recruiter app_demo_1… ')
      const sc = await composeAndVerifyCompanion('screening', { ...base, bank: [] })
      mergeDocuments(db, id, { screening: sc })
      for (const a of (sc.document as ScreeningSet).answers) {
        upsertAnswer(db, { question: a.question, answer: a.answer, language: app.documentLanguage })
      }
      const rm = await composeAndVerifyCompanion('recruiterMessage', {
        ...base,
        recruiterName: 'Mariana',
      })
      mergeDocuments(db, id, { recruiterMessage: rm })
      console.log('done')
    }

    // PDF, pre-generated: Vercel has no Chromium.
    if (await isPdfEngineAvailable()) {
      mkdirSync(path.join(OUT, 'pdf'), { recursive: true })
      const html = renderCvHtml(cv, { language: app.documentLanguage })
      writeFileSync(path.join(OUT, 'pdf', `${id}.pdf`), await renderPdf(html))
      console.log(`pdf ${id}.pdf`)
    } else {
      console.warn(
        'Chromium not available — run `npx playwright install chromium` and re-run for PDFs.',
      )
    }
  }

  for (const [id, outs] of Object.entries(PERSONA_OUTCOMES)) {
    for (const o of outs) appendOutcome(db, id, o)
  }
  setArchived(db, 'app_demo_3', true)

  // Interview plans so "ampliar" works read-only in the demo.
  const interviewPlans: Seed['interviewPlans'] = {}
  for (const role of profile.experience) {
    process.stdout.write(`interview plan ${role.id}… `)
    interviewPlans[role.id] = await planInterview({
      role,
      stubs: [],
      existing: evidence.filter(
        (e) => e.sourceRef.type === 'experience' && e.sourceRef.id === role.id,
      ),
      locale: 'es',
    })
    console.log(`${interviewPlans[role.id].length} questions`)
  }

  const apps = ['app_demo_1', 'app_demo_2', 'app_demo_3']
    .map((id) => getApplication(db, id))
    .filter((a): a is NonNullable<typeof a> => a !== null)

  const seed: Seed = {
    builtAt: new Date().toISOString(),
    profile,
    evidence,
    applications: apps.map((a) => ({
      id: a.id,
      source: a.source,
      sourceUrl: a.sourceUrl ?? undefined,
      company: a.company,
      jobTitle: a.jobTitle,
      market: a.market,
      documentLanguage: a.documentLanguage,
      postingRaw: a.postingRaw,
      postingHash: a.postingHash,
      evidenceHash: a.evidenceHash ?? evidenceHash,
      requirements: a.requirements,
      mappings: a.mappings,
      coverage: a.coverage,
      documents: (a.documents as Record<string, unknown> | null) ?? null,
      groundingReport:
        (a.groundingReport as Seed['applications'][number]['groundingReport']) ?? null,
      outcomes: a.outcomes,
      archived: a.archived,
    })),
    answers: listAnswers(db).map((x) => ({
      question: x.question,
      answer: x.answer,
      language: x.language,
    })),
    interviewPlans,
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, 'seed.json'), `${JSON.stringify(seed, null, 2)}\n`)
  console.log(`\ndemo:build → ${path.join(OUT, 'seed.json')} (${apps.length} applications)`)
  console.log(
    `spent: $${spendSummary(db).totalUsd.toFixed(2)} across ${spendSummary(db).calls} calls`,
  )
} finally {
  close()
  rmSync(tmp, { recursive: true, force: true })
}
