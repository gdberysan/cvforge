import type {
  CompanionKind,
  CoverLetter,
  EvidenceMapping,
  GroundingReport,
  RecruiterMessage,
  Requirement,
  ScreeningSet,
} from '@/lib/schemas'
import { wholeWord } from '@/lib/verify/checks'
import { runCompanionChecks } from '@/lib/verify/companion'
import { findTells, warrantsRewrite } from '@/lib/verify/tells'
import { knownGaps } from './compose'
import { postingVocabularyOf, verifyDistortions } from './distortions'
import { buildEntityIndex, recordSourcesOf } from './projection'
import {
  type CompanionArgs,
  composeCoverLetter,
  composeRecruiterMessage,
  composeScreening,
  selectCredentialsForComposition,
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
  args: CompanionArgs & {
    bank?: { question: string; answer: string }[]
    reasonLanguage?: 'en' | 'es'
  },
): Promise<{ document: CompanionDocument; report: GroundingReport }> {
  const selectedIds = new Set(
    selectEvidenceForComposition(args.mappings, args.evidence).map((e) => e.id),
  )
  const selectedCredentials = selectCredentialsForComposition(args.mappings, args.profile)
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
      selectedCredentials,
      postingVocabulary,
    })

  let document = await compose()
  let report = verify(document)

  const deterministicFailed = !report.passed
  if (deterministicFailed) {
    const problems = [
      ...report.invalidCitations.map(
        (c) =>
          `Paragraph ${c.bulletId} cited "${c.evidenceId}", which is not in <selected-evidence> or <selected-credentials>.`,
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

  if (warrantsRewrite(tells.map((t) => t.phrase)) && report.passed) {
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
  const checked = withGapSources(
    paragraphsOf(kind, document).filter((p) => !failedIds.has(p.id)),
    args.requirements,
    args.mappings,
  )
  report.distortions = await verifyDistortions(
    checked.candidates,
    args.evidence,
    new Map([
      ...selectedCredentials,
      ...recordSourcesOf(args.profile, args.evidence),
      ...checked.sources,
    ]),
    args.reasonLanguage,
    args.jobTitle,
  )
  report.passed = report.passed && report.distortions.length === 0

  return { document, report }
}

/**
 * A paragraph naming a known gap — cited or not — carries that gap as a
 * source of its distortion check, so the model can tell "I have not used
 * Kubernetes" (honest) from "I run Kubernetes in production" (the claim the
 * analysis found nothing for). Companions skip the CV's hard gap rule because
 * naming a gap honestly is allowed in prose; without this, an uncited
 * paragraph was judged against no sources and the gap never came up at all.
 */
export function withGapSources(
  paragraphs: Paragraphish[],
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): { candidates: Paragraphish[]; sources: Map<string, string> } {
  const gaps = [...knownGaps(requirements, mappings)].map(
    ([keyword, requirement]) => [keyword, requirement, wholeWord(keyword)] as const,
  )
  const sources = new Map<string, string>()
  const candidates = paragraphs.map((p) => {
    const named = gaps.filter(([, , matcher]) => matcher.test(p.text))
    for (const [keyword, requirement] of named)
      sources.set(
        `gap:${keyword}`,
        `the analysis found NO evidence for "${requirement}". Acknowledging it as a gap is honest; claiming or implying it is not.`,
      )
    return named.length === 0
      ? p
      : { ...p, citedEvidenceIds: [...p.citedEvidenceIds, ...named.map(([k]) => `gap:${k}`)] }
  })
  return { candidates, sources }
}
