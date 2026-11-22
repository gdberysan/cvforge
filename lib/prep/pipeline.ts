import { verifyDistortions } from '@/lib/ai/distortions'
import { generatePrep } from '@/lib/ai/stages/interview-prep'
import type { PrepContent } from '@/lib/schemas/prep'
import { warrantsRewrite } from '@/lib/verify/tells'
import type { PrepContext } from './context'
import {
  answerRecords,
  checkPrepInCode,
  factLines,
  findPrepTells,
  type PrepFlag,
  type PrepReport,
} from './verify'

export type PrepStage = 'writing' | 'checking' | 'refining'

const ABBREVIATION = /\b(?:e\.g|i\.e|vs|etc|approx|aprox|ej|p\.ej|núm|sr|sra|dr|inc|ltd)\.$/i
const JOINER =
  '(?:and|but|so|then|while|which|y|pero|así que|luego|entonces|mientras|lo que|aunque)'
// Where a new claim can start: after a sentence end, a semicolon, a colon or
// a spaced dash, or after a comma that a joining word follows.
const BOUNDARY = new RegExp(String.raw`(?<=[.!?;:])\s+|\s+[—–]\s+|,\s+(?=${JOINER}\b)`, 'giu')
const MIN_WORDS = 4

/**
 * A spoken line split into the claims it makes, each judged on its own: an
 * invented clause rode through whole behind a true one, joined by a full
 * stop on the first live run and by "; : ," since. "3.4x" and "1.2%" never
 * split, nor does an abbreviation, and a piece too short to claim anything
 * (a list's last item, a label before a colon) stays with its neighbour.
 */
export function claims(text: string): string[] {
  // Spans of the original text, so a merged piece quotes his line verbatim.
  const spans: [number, number][] = []
  let from = 0
  for (const m of text.matchAll(BOUNDARY)) {
    const at = m.index ?? 0
    if (ABBREVIATION.test(text.slice(from, at))) continue
    spans.push([from, at])
    from = at + m[0].length
  }
  spans.push([from, text.length])
  const words = (a: number, b: number) =>
    text
      .slice(a, b)
      .split(/\s+/)
      .filter((w) => /[\p{L}\d]/u.test(w)).length
  const merged: [number, number][] = []
  let carry: number | null = null
  for (const [a, b] of spans) {
    const start: number = carry ?? a
    carry = null
    const last = merged.at(-1)
    if (words(start, b) >= MIN_WORDS) merged.push([start, b])
    else if (last) last[1] = b
    else carry = start
  }
  if (carry !== null) merged.push([carry, text.length])
  return merged
    .map(([a, b]) =>
      text
        .slice(a, b)
        .trim()
        .replace(/\s*[;:,—–]$/u, ''),
    )
    .filter(Boolean)
}

async function check(content: PrepContent, ctx: PrepContext): Promise<PrepReport> {
  const code = checkPrepInCode(content, ctx)
  const failed = new Set(code.map((f) => f.path))
  // Only lines that survived the code checks are worth a model call, and
  // each sentence is judged on its own: on the first live run a beat whose
  // first sentence was true passed whole, carrying an invented second one.
  const sentenceOf = new Map<string, { path: string; text: string }>()
  const candidates = factLines(content)
    .filter((l) => !failed.has(l.path))
    .flatMap((l) =>
      claims(l.text).map((text, i) => {
        const id = `${l.path}#${i}`
        sentenceOf.set(id, { path: l.path, text })
        return { id, text, citedEvidenceIds: l.citedEvidenceIds }
      }),
    )
  const distortions =
    candidates.length === 0
      ? []
      : await verifyDistortions(
          candidates,
          [...ctx.evidence, ...answerRecords(ctx)],
          ctx.extraSources,
          ctx.language === 'en' ? 'en' : 'es',
          ctx.jobTitle,
        )
  // Back to the line he reads, quoting the sentence the check doubted.
  const doubted = new Map<string, string[]>()
  for (const d of distortions) {
    const sentence = sentenceOf.get(d.bulletId)
    const path = sentence?.path ?? d.bulletId
    const reason = sentence ? `“${sentence.text}” ${d.reason}` : d.reason
    doubted.set(path, [...(doubted.get(path) ?? []), reason])
  }
  const flags: PrepFlag[] = [
    ...code,
    ...[...doubted].map(([path, reasons]) => ({
      path,
      kind: 'distortion' as const,
      reason: reasons.join(' · '),
    })),
  ]
  return { flags, tells: findPrepTells(content, ctx.language, ctx), passed: flags.length === 0 }
}

/**
 * Nothing he would have prepared is gone: every item kept, and no beat, CV
 * fact, gap bridge or short line emptied unless the check doubted it — fewer
 * flags bought by deleting content is a thinner prep, not a truer one.
 */
export function keepsPrepSubstance(
  before: PrepContent,
  after: PrepContent,
  flagged: Set<string>,
  overlookedGaps: Set<string> = new Set(),
): boolean {
  if (after.questions.length < before.questions.length) return false
  if (after.cvDefense.length < before.cvDefense.length) return false
  // A gap answer that overlooked his own record may become a story instead.
  const overlooked = before.gapAnswers.filter((g) => overlookedGaps.has(g.id)).length
  if (after.gapAnswers.length < before.gapAnswers.length - overlooked) return false
  const afterStories = new Map(after.stories.map((s) => [s.id, s]))
  for (const s of before.stories) {
    const next = afterStories.get(s.id)
    if (!next) return false
    for (const beat of ['situation', 'task', 'action', 'result'] as const) {
      const path = `stories.${s.id}.${beat}`
      if (s[beat].text !== '' && next[beat].text === '' && !flagged.has(path)) return false
    }
    const said = (lines: string[]) => lines.filter((l) => l.trim() !== '').length
    const doubted = s.short.filter((_, i) => flagged.has(`stories.${s.id}.short.${i}`)).length
    if (said(next.short) < said(s.short) - doubted) return false
  }
  const afterFacts = new Map(after.cvDefense.map((d) => [d.bulletId, d.facts.text]))
  for (const d of before.cvDefense) {
    const path = `cvDefense.${d.bulletId}`
    if (d.facts.text !== '' && !afterFacts.get(d.bulletId) && !flagged.has(path)) return false
  }
  const afterBridges = new Map(after.gapAnswers.map((g) => [g.id, g.bridge.text]))
  for (const g of before.gapAnswers) {
    const path = `gapAnswers.${g.id}.bridge`
    if (overlookedGaps.has(g.id) && !afterBridges.has(g.id)) continue
    if (g.bridge.text !== '' && !afterBridges.get(g.id) && !flagged.has(path)) return false
  }
  return true
}

/**
 * Write, check (code, then the model on what survived, then style), and at
 * most one refine — kept only if it is clean in code, has strictly fewer
 * problems and loses nothing. Any failure of the optional refine returns the
 * checked first draft.
 */
export async function runPrep(
  ctx: PrepContext,
  onStage?: (stage: PrepStage) => void,
): Promise<{ content: PrepContent; report: PrepReport }> {
  onStage?.('writing')
  const content = await generatePrep(ctx)
  onStage?.('checking')
  const report = await check(content, ctx)
  const styleRewrite = report.tells.some((t) => warrantsRewrite(t.phrases))
  if (report.flags.length === 0 && !styleRewrite) return { content, report }

  try {
    onStage?.('refining')
    const problems = [
      ...report.flags.map((f) => `${f.path}: ${f.reason}`),
      ...report.tells.map(
        (t) => `${t.path}: sounds generated (${t.phrases.join(', ')}); say it plainly`,
      ),
    ]
    const refined = await generatePrep(ctx, { previous: content, problems })
    const flagged = new Set(report.flags.map((f) => f.path))
    if (checkPrepInCode(refined, ctx).length > 0) return { content, report }
    const overlookedGaps = new Set(
      report.flags.filter((f) => f.kind === 'overlooked').map((f) => f.path.split('.')[1] ?? ''),
    )
    if (!keepsPrepSubstance(content, refined, flagged, overlookedGaps)) return { content, report }
    const refinedReport = await check(refined, ctx)
    const before = report.flags.length + report.tells.length
    const after = refinedReport.flags.length + refinedReport.tells.length
    // Fabrication outranks style: a refine with more doubted lines is never
    // kept, however many style notes it clears.
    const truer = refinedReport.flags.length <= report.flags.length
    return truer && after < before
      ? { content: refined, report: refinedReport }
      : { content, report }
  } catch {
    return { content, report }
  }
}
