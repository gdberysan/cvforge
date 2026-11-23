import { composeAndVerifyCompanion } from '@/lib/ai/companion'
import { type ComposeStage, composeAndVerify } from '@/lib/ai/compose'
import { postingVocabularyOf } from '@/lib/ai/distortions'
import type { Db } from '@/lib/db/client'
import { listAnswers, upsertAnswer } from '@/lib/db/queries/answers'
import { getApplication, mergeDocuments, saveDocuments } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import type { Locale } from '@/lib/i18n/locale'
import type { CompanionKind, ScreeningSet } from '@/lib/schemas'

/**
 * Writing a document and saving it, shared by the "Generar" routes and the
 * background kit runner (./runner.ts) so the two can never drift: what the
 * runner saves is exactly what the button would have saved. Each throws
 * `Error('not-found')` when the application or the profile is gone.
 */

function load(db: Db, applicationId: string) {
  const application = getApplication(db, applicationId)
  const profile = getProfile(db)
  if (!application || !profile) throw new Error('not-found')
  return { application, profile }
}

export async function generateCv(
  db: Db,
  applicationId: string,
  opts: { reasonLanguage: Locale; onProgress?: (stage: ComposeStage) => void },
) {
  const { application, profile } = load(db, applicationId)
  const { cv, report } = await composeAndVerify({
    reasonLanguage: opts.reasonLanguage,
    profile,
    requirements: application.requirements,
    mappings: application.mappings,
    evidence: listEvidence(db),
    language: application.documentLanguage,
    market: application.market,
    company: application.company,
    jobTitle: application.jobTitle,
    postingVocabulary: postingVocabularyOf(application.requirements),
    onProgress: opts.onProgress,
  })
  saveDocuments(db, application.id, { cv }, report)
  return { cv, report }
}

export async function generateCompanion(
  db: Db,
  applicationId: string,
  kind: CompanionKind,
  opts: { reasonLanguage: Locale; recruiterName?: string },
) {
  const { application, profile } = load(db, applicationId)
  // The bank feeds generation in the document's language only — an answer is
  // written in a language, not translated across one.
  const bank = listAnswers(db)
    .filter((a) => a.language === application.documentLanguage)
    .map((a) => ({ question: a.question, answer: a.answer }))

  const { document, report } = await composeAndVerifyCompanion(kind, {
    reasonLanguage: opts.reasonLanguage,
    profile,
    requirements: application.requirements,
    mappings: application.mappings,
    evidence: listEvidence(db),
    language: application.documentLanguage,
    market: application.market,
    company: application.company,
    jobTitle: application.jobTitle,
    recruiterName: opts.recruiterName,
    bank,
  })

  mergeDocuments(db, application.id, { [kind]: { document, report } })

  // Generate once, refine, reuse: fresh screening answers join the bank —
  // but ONLY when grounding passed. The bank is fed back into future
  // composes as "the person's own prior writing"; banking a failed set
  // would launder an unverified figure into a trusted source, and the
  // in-place upsert would overwrite an answer the user already refined.
  if (kind === 'screening' && report.passed) {
    for (const answer of (document as ScreeningSet).answers) {
      upsertAnswer(db, {
        question: answer.question,
        answer: answer.answer,
        language: application.documentLanguage,
      })
    }
  }
  return { document, report }
}
