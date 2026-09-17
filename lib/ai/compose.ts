import type { CVContent, EvidenceMapping, GroundingReport, Requirement } from '@/lib/schemas'
import { runDeterministicChecks } from '@/lib/verify/checks'
import { verifyDistortions } from './distortions'
import { type ComposeArgs, composeCv, selectEvidenceForComposition } from './stages/compose-cv'

/**
 * Compose, verify in code, repair once, then ask the narrow model question.
 * Nothing unverified ships silently: whatever still fails after the single
 * repair attempt is surfaced on the report, flagged in the UI, never hidden.
 */
export async function composeAndVerify(
  args: ComposeArgs & { postingVocabulary: Set<string> },
): Promise<{ cv: CVContent; report: GroundingReport }> {
  const selected = selectEvidenceForComposition(args.mappings, args.evidence)
  const selectedIds = new Set(selected.map((e) => e.id))
  const checkArgs = {
    evidence: args.evidence,
    profile: args.profile,
    selectedEvidenceIds: selectedIds,
    postingVocabulary: args.postingVocabulary,
    knownGaps: knownGaps(args.requirements, args.mappings),
  }

  let cv = await composeCv(args)
  let report = runDeterministicChecks({ cv, ...checkArgs })

  // Exactly one repair attempt. Beyond that, surface the problems rather than looping.
  if (!report.passed) {
    cv = await composeCv({ ...args, repairInstruction: buildRepairInstruction(report) })
    report = runDeterministicChecks({ cv, ...checkArgs })
  }

  // Only bullets that survived the code checks are worth a model call.
  const failedIds = new Set([
    ...report.uncitedBullets,
    ...report.invalidCitations.map((c) => c.bulletId),
    ...report.unverifiedNumbers.map((n) => n.bulletId),
    ...report.claimedGaps.map((g) => g.bulletId),
  ])

  const candidates = allBullets(cv).filter((b) => !failedIds.has(b.id))
  report.distortions = await verifyDistortions(candidates, args.evidence)

  report.passed = report.passed && report.distortions.length === 0

  return { cv, report }
}

function allBullets(cv: CVContent) {
  return cv.experience.flatMap((role) => role.bullets)
}

/**
 * Keywords and variants of every HARD requirement the analysis mapped to
 * nothing — a bullet claiming one is the fabrication most likely to cost an
 * offer (the Kubernetes-you-don't-have case). Scoped to `hard` on purpose:
 * soft/location/timezone/authorization keywords are common words ("leadership",
 * "collaboration", a city name) that legitimately appear in honest, cited
 * bullets, so treating them as claimable gaps only produces false hard-fails.
 */
function knownGaps(requirements: Requirement[], mappings: EvidenceMapping[]): Map<string, string> {
  const strengthOf = new Map(mappings.map((m) => [m.requirementId, m.strength]))
  const map = new Map<string, string>()
  for (const r of requirements) {
    if (r.kind !== 'hard' || (strengthOf.get(r.id) ?? 'none') !== 'none') continue
    for (const k of [r.keyword, ...r.variants]) map.set(k.toLowerCase(), r.text)
  }
  return map
}

function buildRepairInstruction(report: GroundingReport): string {
  const problems: string[] = []

  for (const g of report.claimedGaps) {
    problems.push(
      `Bullet ${g.bulletId} claims "${g.keyword}", which the analysis marked as a gap: no evidence supports it. Remove the claim — do not rephrase it.`,
    )
  }
  if (report.uncitedBullets.length > 0) {
    problems.push(
      `These bullets had no citation: ${report.uncitedBullets.join(', ')}. Every bullet must cite the evidence ids it derives from.`,
    )
  }
  for (const c of report.invalidCitations) {
    problems.push(
      `Bullet ${c.bulletId} cited "${c.evidenceId}", which is not in <selected-evidence>. Cite only ids listed there.`,
    )
  }
  for (const n of report.unverifiedNumbers) {
    problems.push(
      `Bullet ${n.bulletId} used the figure "${n.token}", which does not appear in the metrics of any evidence it cites. Use only recorded numbers, with their original currency, or drop the figure entirely.`,
    )
  }

  return `Your previous draft failed verification:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nRewrite the CV correcting these. Do not introduce new claims while fixing them.`
}
