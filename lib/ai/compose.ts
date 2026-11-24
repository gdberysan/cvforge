import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  Requirement,
} from '@/lib/schemas'
import {
  codeChecksPassed,
  codeFailedIds,
  degreeSources,
  PROFILE_SKILLS_ID,
  profileSkillsLine,
  roleTitleSources,
  runDeterministicChecks,
  verifiableLines,
} from '@/lib/verify/checks'
import { NO_VERDICT_REASON, verifyDistortions } from './distortions'
import { credentialSources, recordSourcesOf } from './projection'
import { type ComposeArgs, composeCv, selectEvidenceForComposition } from './stages/compose-cv'

/**
 * The stages a CV goes through, in order. 'repairing' only when the code
 * checks failed; 'refining' and 'rechecking' only when the model's check
 * flagged a line.
 */
export type ComposeStage =
  | 'writing'
  | 'checking'
  | 'repairing'
  | 'verifying'
  | 'refining'
  | 'rechecking'

/**
 * Compose, verify in code, repair once, then ask the narrow model question —
 * and when that flags a line, rewrite once more and keep the rewrite only if
 * it is cleaner. Nothing unverified ships silently: whatever still fails is
 * surfaced on the report, flagged in the UI, never hidden.
 */
export async function composeAndVerify(
  args: ComposeArgs & {
    postingVocabulary: Set<string>
    reasonLanguage?: 'en' | 'es'
    /** The real stages as they happen — never a timer pretending to be one. */
    onProgress?: (stage: ComposeStage) => void
  },
): Promise<{ cv: CVContent; report: GroundingReport }> {
  const selected = selectEvidenceForComposition(args.mappings, args.evidence)
  const selectedIds = new Set(selected.map((e) => e.id))
  const checkArgs = checkArgsOf(args, selectedIds)

  args.onProgress?.('writing')
  let cv = await composeCv(args)
  args.onProgress?.('checking')
  let report = runDeterministicChecks({ cv, ...checkArgs })

  // Exactly one repair attempt. Beyond that, surface the problems rather than looping.
  if (!report.passed) {
    args.onProgress?.('repairing')
    cv = await composeCv({
      ...args,
      repairInstruction: buildRepairInstruction(report, selectedIds, args.evidence),
    })
    report = runDeterministicChecks({ cv, ...checkArgs })
  }

  // Only lines that survived the code checks are worth a model call.
  const failedIds = codeFailedIds(report)
  const candidates = verifiableLines(cv, args.profile, selectedIds).filter(
    (b) => !failedIds.has(b.id),
  )
  args.onProgress?.('verifying')
  const sources = distortionSources(args.profile, args.evidence)
  // A base CV's "title" is the name of a brief, not a role applied for.
  const targetTitle = args.focus === undefined ? args.jobTitle : undefined
  report.distortions = await verifyDistortions(
    candidates,
    args.evidence,
    sources,
    args.reasonLanguage,
    targetTitle,
  )
  report.passed = codeChecksPassed(report) && report.distortions.length === 0

  // A line the model flagged used to ship flagged: the code-check repair
  // above never saw it. One rewrite, aimed at exactly the lines the check
  // judged unsupported (a line it never judged is not a reason to rewrite).
  const flagged = report.distortions.filter((d) => d.reason !== NO_VERDICT_REASON)
  if (flagged.length === 0) return { cv, report }
  try {
    args.onProgress?.('refining')
    const refined = await composeCv({
      ...args,
      repairInstruction: buildDistortionRepair(flagged, cv),
    })
    if (!keepsSubstance(cv, refined, new Set(flagged.map((d) => d.bulletId)))) return { cv, report }
    const refinedReport = runDeterministicChecks({ cv: refined, ...checkArgs })
    if (!codeChecksPassed(refinedReport)) return { cv, report }
    args.onProgress?.('rechecking')
    refinedReport.distortions = await verifyDistortions(
      verifiableLines(refined, args.profile, selectedIds),
      args.evidence,
      sources,
      args.reasonLanguage,
      targetTitle,
    )
    // Kept only with strictly fewer problems in all — code failures the
    // draft still had count against it, the rewrite has none.
    const before = codeFailedIds(report).size + report.distortions.length
    if (refinedReport.distortions.length >= before) return { cv, report }
    refinedReport.passed = refinedReport.distortions.length === 0
    return { cv: refined, report: refinedReport }
  } catch {
    // The rewrite is optional: a failed call (spend still recorded) must not
    // throw away the finished, paid draft. It ships with its flags shown.
    return { cv, report }
  }
}

/**
 * Whether a rewrite kept what it was told to keep: every unflagged bullet
 * id, the summary, projects, education, and every skills and extras entry
 * but (where that line was flagged) the one it was flagged for. Fewer flags
 * bought by deleting the skills section or a good bullet is a thinner CV,
 * not a truer one.
 */
export function keepsSubstance(
  draft: CVContent,
  rewrite: CVContent,
  flagged: Set<string>,
): boolean {
  const ids = (cv: CVContent) =>
    new Set([...cv.experience, ...(cv.projects ?? [])].flatMap((s) => s.bullets.map((b) => b.id)))
  const kept = ids(rewrite)
  for (const id of ids(draft)) if (!flagged.has(id) && !kept.has(id)) return false
  if (draft.summary.trim() && !rewrite.summary.trim()) return false
  const items = (cv: CVContent) => cv.skills.reduce((n, g) => n + g.items.length, 0)
  if (items(draft) > 0 && items(rewrite) === 0) return false
  // A flagged skills line loses at most the entry it was flagged for.
  if (items(rewrite) < items(draft) - (flagged.has('skills') ? 1 : 0)) return false
  if ((rewrite.projects ?? []).length < (draft.projects ?? []).length) return false
  if (rewrite.education.length < draft.education.length) return false
  const extras = (cv: CVContent) => cv.extras.reduce((n, g) => n + g.lines.length, 0)
  if (extras(rewrite) < extras(draft) - (flagged.has('extras') ? 1 : 0)) return false
  return true
}

/** What the code checks need besides the CV, shared by compose and re-check. */
export function checkArgsOf(
  args: Pick<
    ComposeArgs,
    'evidence' | 'profile' | 'requirements' | 'mappings' | 'jobTitle' | 'focus'
  > & {
    postingVocabulary: Set<string>
    market?: ComposeArgs['market']
  },
  selectedIds: Set<string>,
) {
  return {
    evidence: args.evidence,
    profile: args.profile,
    selectedEvidenceIds: selectedIds,
    postingVocabulary: args.postingVocabulary,
    knownGaps: knownGaps(args.requirements, args.mappings),
    supportedTerms: supportedTerms(args.requirements, args.mappings),
    market: args.market,
    // A base CV may be headed with its focus; a tailored CV names the
    // posting's title in its summary, as the role sought, never as its head.
    ...(args.focus === undefined ? { soughtTitle: args.jobTitle } : { targetTitle: args.jobTitle }),
  }
}

/**
 * The checks a saved CV would get today, without writing a new one: code
 * checks, then the model question on the lines that pass them. Reports saved
 * by an older checker go stale — one was flagged for figures that sit in its
 * own evidence's metrics, which that checker was never shown.
 */
export async function recheckCv(
  cv: CVContent,
  args: Omit<ComposeArgs, 'language' | 'market' | 'company'> & {
    postingVocabulary: Set<string>
    reasonLanguage?: 'en' | 'es'
    /**
     * The saved document has no `summaryCitedEvidenceIds` at all — written
     * before summaries cited sources (2026-10-14). Read from the raw JSON:
     * the parsed CV defaults the field to [], which a current CV whose
     * summary the model left uncited also has, and that one must still fail.
     */
    legacySummary?: boolean
  },
): Promise<GroundingReport> {
  const selectedIds = new Set(
    selectEvidenceForComposition(args.mappings, args.evidence).map((e) => e.id),
  )
  // A CV saved before summaries cited their sources has none: its summary is
  // judged, like the skills line, against everything the CV could draw on,
  // instead of failing as uncited.
  if (args.legacySummary && cv.summary.trim()) {
    cv = {
      ...cv,
      summaryCitedEvidenceIds: [...credentialSources(args.profile).keys(), ...selectedIds],
    }
  }
  const report = runDeterministicChecks({ cv, ...checkArgsOf(args, selectedIds) })
  const failedIds = codeFailedIds(report)
  report.distortions = await verifyDistortions(
    verifiableLines(cv, args.profile, selectedIds).filter((b) => !failedIds.has(b.id)),
    args.evidence,
    distortionSources(args.profile, args.evidence),
    args.reasonLanguage,
    args.jobTitle,
  )
  report.passed = codeChecksPassed(report) && report.distortions.length === 0
  return report
}

/**
 * The instruction for the second rewrite: the flagged lines with the reason
 * each was flagged, and the whole previous draft, so the composer edits
 * those lines instead of writing a different CV.
 */
export function buildDistortionRepair(
  distortions: GroundingReport['distortions'],
  cv: CVContent,
): string {
  const textOf = new Map<string, string>([
    ['summary', cv.summary],
    ...[...cv.experience, ...(cv.projects ?? [])].flatMap((s) =>
      s.bullets.map((b): [string, string] => [b.id, b.text]),
    ),
    ['skills', cv.skills.map((g) => `${g.category}: ${g.items.join('; ')}`).join(' | ')],
  ])
  const lines = distortions.map((d) => {
    const text = textOf.get(d.bulletId)
    return `- ${d.bulletId}${text ? ` ("${text}")` : ''}: ${d.reason}`
  })
  return [
    'A check of your previous draft found these lines claim more than their sources support:',
    ...lines,
    '',
    'Return the same CV with only those lines corrected: say no more than the cited sources state, or drop the claim (or that one bullet) if it cannot be stated truthfully. For "skills" or "extras", remove or reword only the entry quoted in the reason and keep every other entry. Keep the summary, and every other line, id and citation exactly as it is. Do not introduce new claims.',
    '',
    '<previous-draft>',
    JSON.stringify({
      header: { title: cv.header.title },
      summary: cv.summary,
      summaryCitedEvidenceIds: cv.summaryCitedEvidenceIds ?? [],
      experience: cv.experience,
      projects: (cv.projects ?? []).map((p) => ({ projectId: p.projectId, bullets: p.bullets })),
      education: cv.education,
      skills: cv.skills,
      extras: cv.extras,
    }),
    '</previous-draft>',
  ].join('\n')
}

/**
 * What a cited id stands on beyond its evidence row: a project record's
 * project line, and — for the summary, the one line that may cite one — a
 * credential's own line; and each role's recorded title, which a role title
 * on the CV that is not that title is judged against.
 */
export function distortionSources(
  profile: Parameters<typeof recordSourcesOf>[0],
  evidence: EvidenceItem[],
): Map<string, string> {
  return new Map([
    ...credentialSources(profile),
    ...recordSourcesOf(profile, evidence),
    ...roleTitleSources(profile),
    ...degreeSources(profile),
    [PROFILE_SKILLS_ID, profileSkillsLine(profile)],
  ])
}

/**
 * Keywords and variants of every requirement the evidence supports, strong or
 * partial: the posting's wording for something the person has done, which a
 * CV may mirror — the legitimate half of writing for an ATS.
 */
export function supportedTerms(
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): Set<string> {
  const strengthOf = new Map(mappings.map((m) => [m.requirementId, m.strength]))
  return new Set(
    requirements
      .filter((r) => (strengthOf.get(r.id) ?? 'none') !== 'none')
      .flatMap((r) => [r.keyword, ...r.variants]),
  )
}

/**
 * Keywords and variants of every HARD requirement the analysis mapped to
 * nothing — a bullet claiming one is the fabrication most likely to cost an
 * offer (the Kubernetes-you-don't-have case). Scoped to `hard` on purpose:
 * soft/location/timezone/authorization keywords are common words ("leadership",
 * "collaboration", a city name) that legitimately appear in honest, cited
 * bullets, so treating them as claimable gaps only produces false hard-fails.
 */
export function knownGaps(
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): Map<string, string> {
  const strengthOf = new Map(mappings.map((m) => [m.requirementId, m.strength]))
  const map = new Map<string, string>()
  for (const r of requirements) {
    if (r.kind !== 'hard' || (strengthOf.get(r.id) ?? 'none') !== 'none') continue
    for (const k of [r.keyword, ...r.variants]) map.set(k.toLowerCase(), r.text)
  }
  return map
}

function buildRepairInstruction(
  report: GroundingReport,
  selectedIds: Set<string>,
  evidence: EvidenceItem[],
): string {
  const sourceOf = new Map(evidence.map((e) => [e.id, e.sourceRef]))
  const problems: string[] = []

  for (const g of report.claimedGaps) {
    problems.push(
      `${/^b\d/.test(g.bulletId) ? `Bullet ${g.bulletId}` : `The ${g.bulletId}`} claims "${g.keyword}", which the analysis marked as a gap: no evidence supports it. Remove the claim — do not rephrase it.`,
    )
  }
  if (report.uncitedBullets.length > 0) {
    problems.push(
      `These bullets had no citation: ${report.uncitedBullets.join(', ')}. Every bullet must cite the evidence ids it derives from${report.uncitedBullets.includes('summary') ? ', and the summary must list in "summaryCitedEvidenceIds" every evidence or credential id it draws on' : ''}.`,
    )
  }
  for (const c of report.unsupportedClaims) {
    problems.push(
      c.bulletId === 'title'
        ? `The header title includes "${c.text}", which is none of the person's titles, the posting's title, or anything on file. Use the posting's title verbatim or one of the person's own titles.`
        : c.bulletId === 'education'
          ? `Education lists "${c.text}", which matches no degree in <credentials> (or prints a year that record does not have). List only the education lines given there.`
          : `The ${c.bulletId} section lists "${c.text}", which appears nowhere in the person's skills, evidence, projects or credentials. Remove it, or use the exact wording it has on file.`,
    )
  }
  for (const c of report.invalidCitations) {
    const source = sourceOf.get(c.evidenceId)
    problems.push(
      selectedIds.has(c.evidenceId) && source
        ? `Bullet ${c.bulletId} cited "${c.evidenceId}" in the wrong section: that evidence comes from ${source.type} ${source.id}. ${source.type === 'project' ? `Move the bullet under project ${source.id} in "projects" — never under a role.` : 'Keep it under its role in "experience", not under a project.'}`
        : `Bullet ${c.bulletId} cited "${c.evidenceId}", which is not in <selected-evidence>. Cite only ids listed there.`,
    )
  }
  for (const n of report.unverifiedNumbers) {
    problems.push(
      ['title', 'skills', 'extras'].includes(n.bulletId)
        ? `The ${n.bulletId} section used the figure "${n.token}", which is not on record. Drop it.`
        : `${n.bulletId === 'summary' ? 'The summary' : `Bullet ${n.bulletId}`} used the figure "${n.token}", which does not appear in any evidence it cites (or claims more years than the record covers). Use only recorded numbers, with their original currency, or drop the figure entirely.`,
    )
  }

  return `Your previous draft failed verification:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nRewrite the CV correcting these. Do not introduce new claims while fixing them.`
}
