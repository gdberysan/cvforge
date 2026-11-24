import { cvText } from '@/lib/ats'
import type { ApplicationRecord } from '@/lib/db/queries/applications'
import { estimatePages } from '@/lib/render/page-budget'
import type { CVContent, GroundingReport, MasterProfile } from '@/lib/schemas'
import { wholeWord } from '@/lib/verify/checks'
import { sameJobTitle } from '@/lib/verify/sections'

/**
 * What scripts/eval-cv.ts measures of one written CV, all in code: no model
 * grades another model here. Truth is what still ships flagged; coverage is
 * the supported mandatory requirements the CV actually says.
 */
export type CvMetrics = {
  flags: number
  flagged: string[]
  supported: number
  /** Supported must-haves whose words all appear in the CV, in any order. */
  covered: number
  coverage: number
  /** Stricter: the posting's exact phrase, as an ATS's literal match sees it. */
  atsCovered: number
  atsCoverage: number
  missing: string[]
  pages: number
  figureShare: number
  /** Null when the person never held the posting's title. */
  heldTitle: boolean | null
}

export type CvRun = CvMetrics & {
  at: string
  model: string
  fixture: string
  company: string
  repaired: boolean
  refined: boolean
  seconds: number
  costUsd: number
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Words a requirement's phrasing carries that say nothing on their own. */
const STOP = new Set(
  'and or of the a an in on for to with y o de del la el los las en para con un una experience experiencia years anos skills'.split(
    ' ',
  ),
)
/** A plural or a trailing "es" is the same word for this count. */
const stem = (w: string) => w.replace(/(es|s)$/, '')

export { cvText }

export function cvMetrics(args: {
  cv: CVContent
  report: GroundingReport
  profile: MasterProfile
  application: Pick<ApplicationRecord, 'requirements' | 'mappings' | 'jobTitle'>
}): CvMetrics {
  const { cv, report, profile, application } = args
  const flagged = [
    ...report.unverifiedNumbers.map((f) => `${f.bulletId}: figure "${f.token}" not on record`),
    ...report.invalidCitations.map((f) => `${f.bulletId}: cites ${f.evidenceId}, not usable here`),
    ...report.uncitedBullets.map((id) => `${id}: cites nothing`),
    ...report.claimedGaps.map(
      (f) => `${f.bulletId}: claims "${f.keyword}", which the record lacks`,
    ),
    ...report.unsupportedClaims.map((f) => `${f.bulletId}: "${f.text}" unsupported`),
    ...report.distortions.map((f) => `${f.bulletId}: ${f.reason}`),
  ]

  const strength = new Map(application.mappings.map((m) => [m.requirementId, m.strength]))
  // Strongly supported only: the check showed "partial" too often means
  // vaguely related, and a CV pushed to say those claimed things the
  // record does not state (2026-11-23, 0 → 9 flags).
  const supported = application.requirements.filter(
    (r) => r.mandatory && r.kind === 'hard' && strength.get(r.id) === 'strong',
  )
  const text = cvText(cv)
  const words = new Set(
    fold(text)
      .match(/[\p{L}\p{N}+#]+/gu)
      ?.map(stem) ?? [],
  )
  const phrases = (r: (typeof supported)[number]) =>
    [r.keyword, ...r.variants].filter((k) => k.trim() !== '')
  const literal = (r: (typeof supported)[number]) => phrases(r).some((k) => wholeWord(k).test(text))
  const allWords = (r: (typeof supported)[number]) =>
    phrases(r).some((k) => {
      const content = (fold(k).match(/[\p{L}\p{N}+#]+/gu) ?? []).filter((w) => !STOP.has(w))
      return content.length > 0 && content.every((w) => words.has(stem(w)))
    })
  const said = (r: (typeof supported)[number]) => literal(r) || allWords(r)
  const missing = supported.filter((r) => !said(r)).map((r) => r.keyword)
  const atsCovered = supported.filter(literal).length

  const bullets = [
    ...cv.experience.flatMap((r) => r.bullets),
    ...cv.projects.flatMap((p) => p.bullets),
  ]
  const withFigure = bullets.filter((b) => /\d/.test(b.text)).length

  const held = profile.experience.find((r) => sameJobTitle(r.title, application.jobTitle))
  const opening = fold(cv.summary.slice(0, 160))

  return {
    flags: flagged.length,
    flagged,
    supported: supported.length,
    covered: supported.length - missing.length,
    coverage: supported.length === 0 ? 1 : (supported.length - missing.length) / supported.length,
    atsCovered,
    atsCoverage: supported.length === 0 ? 1 : atsCovered / supported.length,
    missing,
    pages: Number(estimatePages(cv).toFixed(2)),
    figureShare: bullets.length === 0 ? 0 : withFigure / bullets.length,
    heldTitle: held ? opening.includes(fold(held.title)) : null,
  }
}

/**
 * Where this run is worse than the last one on the same fixture. Coverage
 * moves a little between runs of the same model; a drop of a tenth is a
 * change worth reading, not noise.
 */
export function regressions(before: CvRun | undefined, now: CvMetrics): string[] {
  if (!before) return []
  const worse: string[] = []
  if (now.flags > before.flags) worse.push(`flags ${before.flags} → ${now.flags}`)
  if (now.coverage < before.coverage - 0.1) {
    worse.push(`coverage ${before.coverage.toFixed(2)} → ${now.coverage.toFixed(2)}`)
  }
  if (before.heldTitle === true && now.heldTitle === false)
    worse.push('summary no longer opens with the held title')
  if (now.pages > Math.max(2, before.pages + 0.5))
    worse.push(`pages ${before.pages} → ${now.pages}`)
  return worse
}
