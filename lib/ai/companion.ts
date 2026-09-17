import type {
  CompanionKind,
  CoverLetter,
  GroundingReport,
  RecruiterMessage,
  ScreeningSet,
} from '@/lib/schemas'
import { runCompanionChecks } from '@/lib/verify/companion'
import { findTells } from '@/lib/verify/tells'
import { postingVocabularyOf, verifyDistortions } from './distortions'
import { buildEntityIndex } from './projection'
import {
  type CompanionArgs,
  composeCoverLetter,
  composeRecruiterMessage,
  composeScreening,
} from './stages/compose-companion'
import { selectEvidenceForComposition } from './stages/compose-cv'

export type CompanionDocument = CoverLetter | ScreeningSet | RecruiterMessage

type Paragraphish = { id: string; text: string; citedEvidenceIds: string[] }

/** Every companion flattens to paragraphs for the shared verification net. */
function paragraphsOf(kind: CompanionKind, document: CompanionDocument): Paragraphish[] {
  if (kind === 'coverLetter') return (document as CoverLetter).paragraphs
  if (kind === 'screening') {
    return (document as ScreeningSet).answers.map((a) => ({
      id: a.id,
      text: a.answer,
      citedEvidenceIds: a.citedEvidenceIds,
    }))
  }
  const message = document as RecruiterMessage
  return [{ id: 'message', text: message.text, citedEvidenceIds: message.citedEvidenceIds }]
}

/**
 * Same discipline as the CV: compose, verify in code, repair exactly once,
 * surface whatever remains. One consistent story because every companion
 * consumes the same mappings the CV did.
 */
export async function composeAndVerifyCompanion(
  kind: CompanionKind,
  args: CompanionArgs & { bank?: { question: string; answer: string }[] },
): Promise<{ document: CompanionDocument; report: GroundingReport }> {
  const selectedIds = new Set(
    selectEvidenceForComposition(args.mappings, args.evidence).map((e) => e.id),
  )
  const postingVocabulary = postingVocabularyOf(args.requirements)

  const compose = (repairInstruction?: string) => {
    const staged = { ...args, repairInstruction }
    if (kind === 'coverLetter') return composeCoverLetter(staged)
    if (kind === 'screening') return composeScreening({ ...staged, bank: args.bank ?? [] })
    return composeRecruiterMessage(staged)
  }

  const verify = (document: CompanionDocument) =>
    runCompanionChecks({
      paragraphs: paragraphsOf(kind, document),
      evidence: args.evidence,
      profile: args.profile,
      selectedEvidenceIds: selectedIds,
      postingVocabulary,
    })

  let document = await compose()
  let report = verify(document)

  const deterministicFailed = !report.passed
  if (deterministicFailed) {
    const problems = [
      ...report.invalidCitations.map(
        (c) =>
          `Paragraph ${c.bulletId} cited "${c.evidenceId}", which is not in <selected-evidence>.`,
      ),
      ...report.unverifiedNumbers.map(
        (n) =>
          `Paragraph ${n.bulletId} used the figure "${n.token}", which is not in the metrics of any evidence it cites. Use only recorded numbers or drop the figure.`,
      ),
    ]
    document = await compose(
      `Your previous draft failed verification:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nRewrite, correcting these without introducing new claims.`,
    )
    report = verify(document)
  }

  // Style, only once grounding is settled. A model told to "sound human" adds
  // warmth, and the cheapest warmth to fabricate is a reason it wants the job —
  // so this never runs before the checks above, and its rewrite is re-verified
  // by them rather than trusted.
  const exempt = buildEntityIndex(args.profile, args.evidence)
  const tells = paragraphsOf(kind, document).flatMap((p) =>
    findTells(p.text, args.language, exempt).map((phrase) => ({ id: p.id, phrase })),
  )

  if (tells.length > 0 && report.passed) {
    const listed = [...new Set(tells.map((t) => t.phrase))]
    const styled = await compose(
      `Your previous draft reads as machine-written. Remove these, which appeared in it: ${listed
        .map((p) => `"${p}"`)
        .join(
          ', ',
        )}.\n\nRewrite the sentences that contain them so they say the same thing in plainer words — do not simply delete the phrase and leave the sentence limping, and do not substitute a different cliche. Every factual claim and citation must stay exactly as it was: this is a wording pass, not a new draft.`,
    )
    const styledReport = verify(styled)
    // Fails closed. A prettier draft that broke grounding is worse than a
    // stilted one that did not, so the rewrite is kept only if it still passes.
    if (styledReport.passed) {
      document = styled
      report = styledReport
    }
  }

  // The same narrow model question the CV gets — does any paragraph overstate
  // its sources? Sources carry their periods, so an ended engagement written
  // as current ("hoy optimizo…") is a checkable distortion, not a style call.
  const failedIds = new Set([
    ...report.invalidCitations.map((c) => c.bulletId),
    ...report.unverifiedNumbers.map((n) => n.bulletId),
  ])
  const candidates = paragraphsOf(kind, document).filter((p) => !failedIds.has(p.id))
  report.distortions = await verifyDistortions(candidates, args.evidence)
  report.passed = report.passed && report.distortions.length === 0

  return { document, report }
}
