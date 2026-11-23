import {
  type ComposeStage,
  composeAndVerify,
  distortionSources,
  knownGaps,
  supportedTerms,
} from '@/lib/ai/compose'
import { postingVocabularyOf, verifyDistortions } from '@/lib/ai/distortions'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import type { VariantBrief } from '@/lib/db/queries/cv-variants'
import { hashEvidenceProjection } from '@/lib/hash'
import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  Market,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'
import {
  codeChecksPassed,
  codeFailedIds,
  runDeterministicChecks,
  verifiableLines,
} from '@/lib/verify/checks'

export function evidenceHashOf(profile: MasterProfile, evidence: EvidenceItem[]): string {
  return hashEvidenceProjection(buildEvidenceProjection(profile, evidence))
}

/**
 * Composes a base CV through the same compose → check → repair → verify path
 * as a posting's CV. With no posting there is nothing to map, so every
 * evidence item is offered and the composer selects for the focus.
 */
export async function composeVariant(args: {
  brief: VariantBrief
  profile: MasterProfile
  evidence: EvidenceItem[]
  reasonLanguage?: 'en' | 'es'
  onProgress?: (stage: ComposeStage) => void
}): Promise<{ cv: CVContent; report: GroundingReport; evidenceHash: string }> {
  const { cv, report } = await composeAndVerify({
    profile: args.profile,
    evidence: args.evidence,
    requirements: [],
    mappings: [
      {
        requirementId: 'focus',
        evidenceIds: args.evidence.map((e) => e.id),
        strength: 'strong',
        rationale: '',
      },
    ],
    language: args.brief.language,
    market: args.brief.market,
    company: '',
    jobTitle: args.brief.name,
    focus: args.brief.focus,
    // Every base CV can be translated into its other language, which runs
    // longer in Spanish: composed with room for it, the pair rarely needs
    // the cuts translateAndSave would then make on both sides.
    willTranslate: true,
    postingVocabulary: new Set(),
    reasonLanguage: args.reasonLanguage,
    onProgress: args.onProgress,
  })
  return { cv, report, evidenceHash: evidenceHashOf(args.profile, args.evidence) }
}

/**
 * The report a base CV earns against one application. The code checks re-run
 * for free against today's evidence and this posting's gaps, so a bullet
 * claiming something the posting marked as missing is flagged exactly as it
 * would be on a CV composed for it. The model's distortion verdicts are
 * carried over from compose time — the bullets have not changed since.
 */
export function checkVariantFor(args: {
  cv: CVContent
  /** The base CV's name: the title it was composed for. */
  name: string
  /** The base CV's market: which currency a bare "$" reads as. */
  market?: Market
  composedReport: GroundingReport | null
  profile: MasterProfile
  evidence: EvidenceItem[]
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}): GroundingReport {
  const report = runDeterministicChecks({
    cv: args.cv,
    evidence: args.evidence,
    profile: args.profile,
    selectedEvidenceIds: new Set(args.evidence.map((e) => e.id)),
    postingVocabulary: postingVocabularyOf(args.requirements),
    knownGaps: knownGaps(args.requirements, args.mappings),
    supportedTerms: supportedTerms(args.requirements, args.mappings),
    // A base CV is headed for its own focus, not this posting's; its name is
    // that focus. Never its header title: a title that grounds itself can't
    // be flagged.
    targetTitle: args.name,
    market: args.market,
  })
  const allIds = args.evidence.map((e) => e.id)
  const lineIds = new Set(verifiableLines(args.cv, args.profile, allIds).map((b) => b.id))
  report.distortions = (args.composedReport?.distortions ?? []).filter((d) =>
    lineIds.has(d.bulletId),
  )
  report.passed = report.passed && report.distortions.length === 0
  return report
}

/**
 * checkVariantFor, plus a fresh model check when the evidence changed since
 * compose: a carried-over verdict judged the bullets against sources that no
 * longer read the same (an end date added makes a present-tense bullet false).
 * Only bullets that passed the code checks are sent, as compose does.
 */
export async function verifyVariantFor(
  args: Parameters<typeof checkVariantFor>[0] & {
    composedEvidenceHash: string | null
    reasonLanguage?: 'en' | 'es'
  },
): Promise<GroundingReport> {
  const report = checkVariantFor(args)
  if (args.composedEvidenceHash === evidenceHashOf(args.profile, args.evidence)) return report

  const failed = codeFailedIds(report)
  const candidates = verifiableLines(
    args.cv,
    args.profile,
    args.evidence.map((e) => e.id),
  ).filter((b) => !failed.has(b.id))
  report.distortions = await verifyDistortions(
    candidates,
    args.evidence,
    distortionSources(args.profile, args.evidence),
    args.reasonLanguage,
  )
  report.passed = codeChecksPassed(report) && report.distortions.length === 0
  return report
}
