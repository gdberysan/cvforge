import { type ComposeStage, distortionSources } from '@/lib/ai/compose'
import { type DistortionCandidate, verifyDistortions } from '@/lib/ai/distortions'
import { type CVTranslation, translateCv } from '@/lib/ai/stages/translate-cv'
import type { Db } from '@/lib/db/client'
import { getVariant, replaceVariantCv, saveTranslatedVariant } from '@/lib/db/queries/cv-variants'
import { documentSpanish } from '@/lib/markets'
import { fitPairToPages } from '@/lib/render/page-budget'
import type {
  CVContent,
  EvidenceItem,
  GeneratedBullet,
  GroundingReport,
  MasterProfile,
} from '@/lib/schemas'
import { otherLanguage } from '@/lib/variant-pairs'
import { evidenceHashOf } from '@/lib/variants'
import {
  codeChecksPassed,
  codeFailedIds,
  runDeterministicChecks,
  verifiableLines,
} from '@/lib/verify/checks'
import { roleTitleId } from '@/lib/verify/line-text'
import { fold } from '@/lib/verify/sections'

/** A translation that was not saved, with the code the client translates. */
export class TranslateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TranslateError'
  }
}

/** The model changed the CV's structure in a way code cannot repair: nothing is saved. */
export class TranslateMismatchError extends TranslateError {
  constructor(detail: string) {
    super('translate-mismatch', `The translation does not match the source CV: ${detail}`)
    this.name = 'TranslateMismatchError'
  }
}

/**
 * The source CV with the model's translated text laid over it. Identity is
 * the source's, never the model's: ids, citations, experience and project
 * ids, companies, project names, dates, the name and contact lines are all
 * copied from the source. What code cannot repair — a line dropped, added,
 * or emptied — is a mismatch, because a translation that says less (or
 * more) than its source is a different CV, not the same one in another
 * language.
 */
export function mergeTranslation(
  source: CVContent,
  draft: CVTranslation,
  /** Recorded credentials: an extras line naming one is copied, never translated. */
  profile?: MasterProfile,
): CVContent {
  return {
    header: { ...source.header, title: text('header title', source.header.title, draft.title) },
    summary: text('summary', source.summary, draft.summary),
    summaryCitedEvidenceIds: [...source.summaryCitedEvidenceIds],
    experience: sameLength('roles', source.experience, draft.experience).map(([role, out]) => ({
      ...sameId('role', role.experienceId, out.experienceId, role),
      title: text(`title of ${role.experienceId}`, role.title, out.title),
      ...(role.location !== undefined ? { location: out.location.trim() || role.location } : {}),
      bullets: mergeBullets(role.experienceId, role.bullets, out.bullets),
    })),
    projects: sameLength('projects', source.projects, draft.projects).map(([project, out]) => ({
      ...sameId('project', project.projectId, out.projectId, project),
      bullets: mergeBullets(project.projectId, project.bullets, out.bullets),
    })),
    education: sameLength('education', source.education, draft.education).map(([entry, out]) => ({
      degree: text('degree', entry.degree, out.degree),
      // A proper name: the source's, whatever the model wrote.
      institution: entry.institution,
      // Dates are not translated: a period whose years moved is the source's.
      period: sameYears(entry.period, out.period) ? out.period : entry.period,
    })),
    skills: sameLength('skill groups', source.skills, draft.skills).map(([group, out]) => ({
      category: text('skill category', group.category, out.category),
      items: sameLength(`items of ${group.category}`, group.items, out.items).map(([item, t]) =>
        text('skill', item, t),
      ),
    })),
    extras: sameLength('extras', source.extras, draft.extras).map(([group, out]) => ({
      heading: text('extras heading', group.heading, out.heading),
      lines: sameLength(`lines of ${group.heading}`, group.lines, out.lines).map(([line, t]) =>
        profile && namesCertification(profile, line) ? line : text('extras line', line, t),
      ),
    })),
  }
}

/**
 * A section's bullets, each translated text on its own source bullet, matched
 * by id. Fails closed: the model must return exactly the source's ids — none
 * renamed, none twice. Guessing by position would hang one bullet's
 * citations on another's text the moment a rename and a reorder coincide.
 * A reorder alone is harmless and is put back in the source's order.
 */
function mergeBullets(
  section: string,
  source: GeneratedBullet[],
  out: { id: string; text: string }[],
): GeneratedBullet[] {
  sameLength(`bullets of ${section}`, source, out)
  const byId = new Map(out.map((b) => [b.id, b]))
  if (byId.size !== out.length)
    throw new TranslateMismatchError(`bullets of ${section}: an id came back twice`)
  return source.map((bullet) => {
    const translated = byId.get(bullet.id)
    if (!translated)
      throw new TranslateMismatchError(`bullets of ${section}: ${bullet.id} did not come back`)
    return {
      ...bullet,
      citedEvidenceIds: [...bullet.citedEvidenceIds],
      keywordsUsed: [...bullet.keywordsUsed],
      text: text(`bullet ${bullet.id}`, bullet.text, translated.text),
    }
  })
}

/** Roles and projects come back in the source's order, under the source's ids. */
function sameId<T>(what: string, source: string, out: string, value: T): T {
  if (source !== out)
    throw new TranslateMismatchError(`${what} ${source} came back as ${out || '(none)'}`)
  return value
}

function sameLength<S, T>(what: string, source: S[], out: T[]): [S, T][] {
  if (source.length !== out.length)
    throw new TranslateMismatchError(`${what}: ${source.length} in the source, ${out.length} back`)
  return source.map((s, i) => [s, out[i]])
}

/** A line the source has must come back as a line: an emptied one was dropped. */
function text(what: string, source: string, out: string): string {
  if (source.trim() !== '' && out.trim() === '')
    throw new TranslateMismatchError(`${what} came back empty`)
  return source.trim() === '' ? source : out
}

/**
 * An extras line that names a recorded certification ("Optimización de
 * Conversiones — Google (2024)"). Its name is the credential's own, so the
 * source line is kept verbatim: a live run translated one and the check,
 * unable to match it to the record, flagged the issuer as added. Languages
 * are left out on purpose — "Español — nativo" ↔ "Spanish — native" is a
 * translation the checks already read in both languages.
 */
function namesCertification(profile: MasterProfile, line: string): boolean {
  const folded = fold(line)
  return profile.certifications.some((c) => {
    const name = fold(c.name)
    return name.length >= 3 && folded.includes(name)
  })
}

function sameYears(a: string, b: string): boolean {
  const years = (s: string) => (s.match(/\d{4}/g) ?? []).join(',')
  return years(a) === years(b)
}

/**
 * The other language of a base CV, translated from it — same bullets, same
 * citations — and held to the same checks as any base CV: the code checks
 * (numbers by value, citations, entities, sections) and the model distortion
 * check on the lines that survive them, exactly as compose runs them. Saved
 * only when the translation matches the source's structure; the report says
 * whatever the checks found, as it does for a composed CV.
 */
export async function translateAndSave(
  db: Db,
  args: {
    sourceId: string
    profile: MasterProfile
    evidence: EvidenceItem[]
    /**
     * The row this translation replaces — the other side the person was
     * looking at — or none, for a new row. Never looked up by name: two rows
     * can share a name and market, and a lookup could overwrite the composed
     * CV of another pair.
     */
    targetId?: string
    reasonLanguage?: 'en' | 'es'
    onProgress?: (stage: ComposeStage) => void
    /** Called with the number of cuts when the source had to be cut too. */
    onTrimmedSource?: (cuts: number) => void
  },
): Promise<string> {
  const source = getVariant(db, args.sourceId)
  if (!source?.cv)
    throw new TranslateError('variant-not-found', 'Base CV not found or not composed.')
  const language = otherLanguage(source.language)
  if (args.targetId !== undefined) {
    // Checked before the paid call: only the same CV's other side may be replaced.
    const target = getVariant(db, args.targetId)
    if (
      !target ||
      target.name !== source.name ||
      target.market !== source.market ||
      target.language !== language
    )
      throw new TranslateError('translate-target', 'That CV is not the other side of this one.')
  }

  args.onProgress?.('writing')
  const merged = mergeTranslation(
    source.cv,
    await translateCv(
      source.cv,
      language,
      documentSpanish(source.market, args.profile.preferences.markets),
    ),
    args.profile,
  )
  // The other language can run longer than the page allows. Cut both sides
  // alike — same bullets, same skill positions, same trailing sentences — so
  // the pair stays one CV in two languages and the translation never holds
  // a line its source lacks. Done before any check, so both reports describe
  // what prints.
  const fitted = fitPairToPages(source.cv, merged)
  const cv = fitted.translated

  args.onProgress?.('checking')
  const allIds = args.evidence.map((e) => e.id)
  const report: GroundingReport = runDeterministicChecks({
    cv,
    evidence: args.evidence,
    profile: args.profile,
    selectedEvidenceIds: new Set(allIds),
    postingVocabulary: new Set(),
    knownGaps: new Map(),
    supportedTerms: new Set(),
    // A translated title cannot match the record's wording, so the code
    // check would only flag honest translations; titleLines sends every
    // title to the model check instead, against what it was translated from.
    targetTitle: cv.header.title,
    market: source.market,
  })

  args.onProgress?.('verifying')
  const failed = codeFailedIds(report)
  const titles = titleLines(source.cv, cv, args.profile)
  // titleLines judges every title against what it was translated from, so the
  // role-title lines verifiableLines adds are left out: one line per id, or the
  // verdicts collapse onto each other.
  const titleIds = new Set(titles.lines.map((l) => l.id))
  report.distortions = await verifyDistortions(
    [
      ...titles.lines,
      ...verifiableLines(cv, args.profile, allIds).filter(
        (b) => !failed.has(b.id) && !titleIds.has(b.id),
      ),
    ],
    args.evidence,
    new Map([...distortionSources(args.profile, args.evidence), ...titles.sources]),
    args.reasonLanguage,
  )
  report.passed = codeChecksPassed(report) && report.distortions.length === 0

  const trimmed = fitted.trims > 0
  const sourceReport = trimmed
    ? recheckTrimmedSource(fitted.source, source.report, source.name, args)
    : null
  // Both sides or neither: a cut source beside an unsaved translation would
  // be a shorter CV with nothing to show for it.
  const id = db.transaction(() => {
    if (trimmed && sourceReport) {
      replaceVariantCv(db, source.id, { cv: fitted.source, report: sourceReport })
    }
    return saveTranslatedVariant(
      db,
      { name: source.name, focus: source.focus, language, market: source.market },
      {
        cv,
        report,
        evidenceHash: source.evidenceHash ?? evidenceHashOf(args.profile, args.evidence),
      },
      args.targetId,
    )
  })
  if (trimmed) args.onTrimmedSource?.(fitted.trims)
  return id
}

/**
 * A source CV's report after the pair was cut: the code checks re-run (free)
 * on what now prints, in the context a base CV is composed in, and the
 * compose-time model verdicts kept for the lines still there. Nothing new is
 * judged — only removed — so no model call is needed; a verdict on a removed
 * bullet goes with it.
 */
function recheckTrimmedSource(
  cv: CVContent,
  composed: GroundingReport | null,
  /** The base CV's name: the title it was composed for. */
  name: string,
  args: { profile: MasterProfile; evidence: EvidenceItem[] },
): GroundingReport {
  const allIds = args.evidence.map((e) => e.id)
  const report = runDeterministicChecks({
    cv,
    evidence: args.evidence,
    profile: args.profile,
    selectedEvidenceIds: new Set(allIds),
    postingVocabulary: new Set(),
    knownGaps: new Map(),
    supportedTerms: new Set(),
    targetTitle: name,
  })
  const lineIds = new Set([
    'title',
    ...verifiableLines(cv, args.profile, allIds).map((b) => b.id),
    ...cv.experience.map((r) => roleTitleId(r.experienceId)),
  ])
  report.distortions = (composed?.distortions ?? []).filter((d) => lineIds.has(d.bulletId))
  report.passed = codeChecksPassed(report) && report.distortions.length === 0
  return report
}

/**
 * The header title and every role title, as lines for the distortion check.
 * No code check can read a translated title ("Coordinator" → "Gerente" is a
 * promotion; "Coordinador" is not), so each is judged by the model against
 * the source title it was translated from — already verified on the source
 * CV — and the titles the person recorded. Each rides on its own source id
 * so the verifier sees exactly the one title it must match.
 */
export function titleLines(
  source: CVContent,
  translated: CVContent,
  profile: MasterProfile,
): { lines: DistortionCandidate[]; sources: Map<string, string> } {
  const recorded = profile.experience.map((r) => `"${r.title}" (${r.company})`).join('; ')
  const rule =
    'The text is a translation into another language. It is supported only when it is a faithful translation of that title, claiming no more seniority, scope, ownership or specialty; wording that differs only by language is supported.'
  const lines: DistortionCandidate[] = []
  const sources = new Map<string, string>()
  const add = (id: string, text: string, from: string, recordedLine: string) => {
    if (!text.trim()) return
    const sourceId = `profile:translated-${id}`
    lines.push({ id, text, citedEvidenceIds: [sourceId] })
    sources.set(sourceId, `translated from the title "${from}". ${recordedLine} ${rule}`)
  }
  add(
    'title',
    translated.header.title,
    source.header.title,
    `The person's recorded titles: ${recorded || '(none)'}.`,
  )
  translated.experience.forEach((role, i) => {
    const onFile = profile.experience.find((r) => r.id === role.experienceId)
    add(
      roleTitleId(role.experienceId),
      role.title,
      source.experience[i]?.title ?? '',
      onFile ? `Recorded title of this role: "${onFile.title}" at ${onFile.company}.` : '',
    )
  })
  return { lines, sources }
}
