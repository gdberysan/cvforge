import type { CVContent, GeneratedBullet } from '@/lib/schemas'
import { cvOutline } from './outline'

/**
 * How many pages a CV may print, in every market. A US CV is asked to bias
 * toward one but is never cut below two in code — trimming a career to one
 * page is an editorial call, not a rule.
 */
export const MAX_PAGES = 2

// The geometry of lib/render/cv-html.ts, in millimetres: A4 with 16 mm top
// and bottom margins, 10.5 pt body at 1.42 line height on a 180 mm column.
// Characters per line are fitted against real renders (see
// tests/render/page-budget.test.ts). Keep in step with documentCss.
export type Geometry = { charsPerLine: number; bulletCharsPerLine: number }
const FITTED: Geometry = { charsPerLine: 104, bulletCharsPerLine: 104 }

const PT = 0.3528
const PAGE_HEIGHT = 297 - 2 * 16
const LINE = 10.5 * PT * 1.42
const HEADING = 7 + 2.5 + 1 + 11 * PT * 1.42
const PARAGRAPH_GAP = 10.5 * PT

function lines(text: string, perLine: number): number {
  return Math.max(1, Math.ceil(text.length / perLine))
}

/** A run of printed height: a role (never split) or one line of flowing text. */
type Box = { mm: number; keep: boolean }

/**
 * The printed length of a CV in pages, with the last page as a fraction,
 * laid out the way the template lays it out: text flows line by line, and a
 * role or project moves whole to the next page when it does not fit
 * (page-break-inside: avoid) — the space it leaves is lost.
 */
export function estimatePages(cv: CVContent, g: Geometry = FITTED): number {
  const boxes: Box[] = []
  const flow = (mm: number) => boxes.push({ mm, keep: false })
  const flowText = (text: string, perLine: number) => {
    for (let i = 0; i < lines(text, perLine); i++) flow(LINE)
  }

  // Walks the same outline every renderer prints, so the estimate cannot
  // count a section the document leaves out, or miss one it adds.
  const outline = cvOutline(cv, 'es-MX')
  flow(20 * PT * 1.2 + 2 + (outline.title ? 11.5 * PT * 1.42 : 0) + 3 + 9.5 * PT * 1.42)
  for (const section of outline.sections) {
    flow(HEADING)
    for (const it of section.items) {
      if (it.kind === 'para') {
        flowText(it.text, g.charsPerLine)
        flow(PARAGRAPH_GAP)
      } else if (it.kind === 'skills') {
        flowText(`${it.category}: ${it.items.join(', ')}`, g.charsPerLine)
        flow(1.5)
      } else {
        boxes.push({
          keep: true,
          mm:
            LINE +
            (it.bullets.length > 0 ? 1.5 : 0) +
            it.bullets.reduce((sum, b) => sum + lines(b, g.bulletCharsPerLine) * LINE + 1, 0) +
            4.5,
        })
      }
    }
  }

  let pages = 1
  let used = 0
  for (const box of boxes) {
    if (used + box.mm > PAGE_HEIGHT && used > 0 && (box.keep ? box.mm <= PAGE_HEIGHT : true)) {
      pages++
      used = 0
    }
    used += box.mm
  }
  return pages - 1 + used / PAGE_HEIGHT
}

/** Headroom under the limit: the estimate is calibrated, not exact. */
const SAFETY = 0.02

/**
 * The headroom a base CV is composed with: every base CV can be translated,
 * Spanish runs about 10% longer than English, and a translation that does
 * not fit forces cuts on both sides of the pair.
 */
export const TRANSLATION_HEADROOM = 0.15

/** How many of the newest roles count as recent work: trimmed last. */
const RECENT_ROLES = 3
/** The prompt's skills cap, enforced first: rows, and items a row. */
const SKILL_ROW_CAP = 4
const SKILL_ITEM_CAP = 8
/** A skills row is not cut below this many items before rows are dropped. */
const SKILL_ITEM_FLOOR = 5
/** Rows of skills kept, at the least. */
const SKILL_ROW_FLOOR = 3
/** Sentences of summary kept, at the least. */
const SUMMARY_SENTENCE_FLOOR = 2

export type FitOptions = {
  /** Pages held back below the market's limit (see TRANSLATION_HEADROOM). */
  headroom?: number
  /**
   * How much a bullet answers the posting a tailored CV was written for:
   * within each step, the lowest goes first and position breaks ties. Absent
   * for a base CV, which has no posting — position order alone.
   */
  relevance?: (bullet: GeneratedBullet) => number
  /**
   * The evidence ids of each mandatory requirement the posting's analysis
   * mapped (strong or partial). A bullet that is the CV's only one citing
   * any of a requirement's ids is protected until the final step: cutting
   * it would drop the only proof of something the posting demands.
   */
  mandatoryEvidence?: string[][]
}

/** One removal. Nothing is ever rewritten or added. */
type Trim =
  | { kind: 'bullet'; id: string }
  | { kind: 'skill-item'; row: number }
  | { kind: 'skill-row' }
  | { kind: 'sentence' }

/**
 * Cuts a CV down to its market's page limit, in code, after the model wrote
 * it: the prompt's "two pages maximum" alone printed three pages on 15 of 18
 * real CVs. It trims by relevance, in steps, until it fits:
 *
 * 0. the skills cap the prompt asks for — 4 rows of 8 items: trailing
 *    items of the longest row over 8 first, then trailing rows over 4;
 * 1. bullets of roles older than the three most recent, oldest first, down
 *    to none (the role keeps its line, so the history stays complete), then
 *    projects' bullets — a project left with none is dropped — and, on a
 *    tailored CV, recent roles' bullets that answer nothing in the posting,
 *    down to one a role;
 * 2. skills: the last item of the longest row, down to five a row, then
 *    whole trailing rows, down to three rows;
 * 3. the summary's trailing sentences, whole, down to two;
 * 4. bullets of the second and third most recent roles, the older first,
 *    down to one each; only then the newest role's, down to one;
 * 5. last, a tailored CV's protected bullets — the only evidence left for a
 *    mandatory requirement — in the same order, never below those floors.
 *
 * The composer orders bullets, skills and summary most relevant first, so
 * each cut takes from an end. A tailored CV passes `relevance`, and within a
 * step a bullet that answers nothing in the posting goes before one that
 * does. Removing a whole sentence cannot invent anything, and every
 * remaining line is checked as before; the summary's cited ids stay as they
 * are — a citation can only widen what the check allows, never assert.
 * Past the last step the CV is left long and the studio says so.
 */
export function fitToPages(cv: CVContent, options: FitOptions = {}): CVContent {
  const limit = MAX_PAGES - SAFETY - (options.headroom ?? 0)
  const next: CVContent = structuredClone(cv)
  while (estimatePages(next) > limit) {
    const trim = nextTrim(next, options, true)
    if (!trim) break
    applyTrim(next, trim)
  }
  return dropEmptyProjects(next)
}

/**
 * Fits a base CV and its translation together: the same steps, decided once
 * and applied to both, until both fit — the same bullet ids, the same skill
 * positions, the same number of trailing sentences. The pair then stays the
 * same CV in two languages, and a translated side never says what its source
 * does not. When the two summaries do not split into the same number of
 * sentences, a position means nothing across them and the summary step is
 * skipped.
 */
export function fitPairToPages(
  source: CVContent,
  translated: CVContent,
  /** Test hook: pages held back below the limit. */
  headroom = 0,
): { source: CVContent; translated: CVContent; trims: number } {
  const limit = MAX_PAGES - SAFETY - headroom
  const a: CVContent = structuredClone(source)
  const b: CVContent = structuredClone(translated)
  let trims = 0
  while (Math.max(estimatePages(a), estimatePages(b)) > limit) {
    const aligned = summarySentences(a.summary).length === summarySentences(b.summary).length
    const trim = nextTrim(a, {}, aligned)
    if (!trim) break
    applyTrim(a, trim)
    applyTrim(b, trim)
    trims++
  }
  return { source: dropEmptyProjects(a), translated: dropEmptyProjects(b), trims }
}

/**
 * Words a period follows without ending a sentence, compared lowercased with
 * any opening mark removed. A cut after one ("…reporté al Sr.") would print
 * half a sentence.
 */
const ABBREVIATIONS = new Set([
  'sr.',
  'sra.',
  'jr.',
  'lic.',
  'ing.',
  'mtro.',
  'mtra.',
  'dr.',
  'dra.',
  'e.g.',
  'i.e.',
  'p.',
  'ej.',
  'etc.',
  'vs.',
  'u.s.',
  'ee.',
  'uu.',
  's.a.',
  'c.v.',
  'inc.',
  'co.',
  'no.',
])

/**
 * A summary's sentences: a break after ".", "!" or "?" followed by a space
 * and a capital, a digit or an opening mark — so "3.4x" or "$1.2M" never
 * split — and never after a common abbreviation ("Sr. Manager").
 */
export function summarySentences(summary: string): string[] {
  const text = summary.trim()
  const sentences: string[] = []
  let start = 0
  for (const m of text.matchAll(/(?<=[.!?…])\s+(?=[¿¡"“(]?[\p{Lu}\d])/gu)) {
    const before = text.slice(start, m.index)
    const word = (before.split(/\s+/).pop() ?? '').replace(/^[¿¡"“(]+/, '').toLowerCase()
    if (ABBREVIATIONS.has(word)) continue
    sentences.push(before)
    start = m.index + m[0].length
  }
  if (start < text.length) sentences.push(text.slice(start))
  return sentences
}

function nextTrim(cv: CVContent, options: FitOptions, summaryStep: boolean): Trim | null {
  const { relevance } = options
  const recent = cv.experience.slice(0, RECENT_ROLES)
  // Cutting order: older roles oldest first, projects, then the recent roles
  // oldest first — the newest role is always the last place a cut lands.
  const older = cv.experience
    .slice(RECENT_ROLES)
    .reverse()
    .map((r) => ({ bullets: r.bullets, floor: 0 }))
  const projects = cv.projects.map((p) => ({ bullets: p.bullets, floor: 0 }))
  const middle = recent
    .slice(1)
    .reverse()
    .map((r) => ({ bullets: r.bullets, floor: 1 }))
  const newest = recent.slice(0, 1).map((r) => ({ bullets: r.bullets, floor: 1 }))
  const guarded = soleEvidence(cv, options.mandatoryEvidence ?? [])
  const open = (b: GeneratedBullet) => !guarded.has(b.id)

  // 0. The prompt's skills cap: items over 8 (longest row first), then rows over 4.
  const overCap = longestRow(cv.skills, SKILL_ITEM_CAP)
  if (overCap >= 0) return { kind: 'skill-item', row: overCap }
  if (cv.skills.length > SKILL_ROW_CAP) return { kind: 'skill-row' }

  // 1. Older roles, then projects — down to nothing — and, on a tailored CV,
  // recent bullets that answer nothing in the posting, down to one a role.
  const step1 =
    pickBullet([...older, ...projects], relevance, open) ??
    (relevance
      ? pickBullet([...middle, ...newest], relevance, (b) => open(b) && relevance(b) === 0)
      : null)
  if (step1) return step1

  // 2. Skills: the longest row loses its last item, then trailing rows go.
  const longest = longestRow(cv.skills, SKILL_ITEM_FLOOR)
  if (longest >= 0) return { kind: 'skill-item', row: longest }
  if (cv.skills.length > SKILL_ROW_FLOOR) return { kind: 'skill-row' }

  // 3. The summary's trailing sentences.
  if (summaryStep && summarySentences(cv.summary).length > SUMMARY_SENTENCE_FLOOR)
    return { kind: 'sentence' }

  // 4. The second and third most recent roles (the older first), down to one
  // bullet each; the newest role only after them — what a recruiter reads
  // first is the last thing cut.
  const step4 = pickBullet(middle, relevance, open) ?? pickBullet(newest, relevance, open)
  if (step4) return step4

  // 5. The protected bullets, in the same order, within the same floors.
  const any = () => true
  return (
    pickBullet([...older, ...projects], relevance, any) ??
    pickBullet(middle, relevance, any) ??
    pickBullet(newest, relevance, any)
  )
}

/**
 * The bullets that alone carry a mandatory requirement: for each
 * requirement's evidence ids, the one bullet citing any of them, when only
 * one does. Worked out on the CV as it stands, so the last of several
 * bullets for a requirement becomes protected once the others are gone.
 */
function soleEvidence(cv: CVContent, mandatoryEvidence: string[][]): Set<string> {
  const bullets = [...cv.experience, ...cv.projects].flatMap((s) => s.bullets)
  const sole = new Set<string>()
  for (const ids of mandatoryEvidence) {
    const wanted = new Set(ids)
    const citing = bullets.filter((b) => b.citedEvidenceIds.some((id) => wanted.has(id)))
    if (citing.length === 1) sole.add(citing[0].id)
  }
  return sole
}

/** The longest skills row over `above` items (the later on a tie), or -1. */
function longestRow(rows: CVContent['skills'], above: number): number {
  let longest = -1
  rows.forEach((row, i) => {
    if (row.items.length > above && (longest < 0 || row.items.length >= rows[longest].items.length))
      longest = i
  })
  return longest
}

/**
 * The next bullet to cut among `sections` (listed in cutting order), of
 * those `eligible`: the least relevant, ties going to the earliest section
 * and, within one, the last bullet. With no relevance, simply the last
 * eligible bullet of the first section that has one. A section at its
 * floor gives up no more.
 */
function pickBullet(
  sections: { bullets: GeneratedBullet[]; floor: number }[],
  relevance: FitOptions['relevance'],
  eligible: (bullet: GeneratedBullet) => boolean,
): Trim | null {
  let best: { id: string; score: number } | null = null
  for (const section of sections) {
    if (section.bullets.length <= section.floor) continue
    const candidates = section.bullets.filter(eligible).reverse()
    if (!relevance) {
      if (candidates.length > 0) return { kind: 'bullet', id: candidates[0].id }
      continue
    }
    for (const bullet of candidates) {
      const score = relevance(bullet)
      if (!best || score < best.score) best = { id: bullet.id, score }
    }
  }
  return best && { kind: 'bullet', id: best.id }
}

function applyTrim(cv: CVContent, trim: Trim): void {
  switch (trim.kind) {
    case 'bullet':
      for (const section of [...cv.experience, ...cv.projects])
        section.bullets = section.bullets.filter((b) => b.id !== trim.id)
      return
    case 'skill-item':
      cv.skills[trim.row]?.items.pop()
      return
    case 'skill-row':
      cv.skills.pop()
      return
    case 'sentence':
      cv.summary = summarySentences(cv.summary).slice(0, -1).join(' ')
      return
  }
}

/** A project with nothing said about it is not printed. */
function dropEmptyProjects(cv: CVContent): CVContent {
  return { ...cv, projects: cv.projects.filter((p) => p.bullets.length > 0) }
}
