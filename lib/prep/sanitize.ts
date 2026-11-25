import type { ModelPrep, PrepContent } from '@/lib/schemas/prep'
import { allowedQuantityForms } from '@/lib/verify/checks'
import { extractQuantities, normaliseQuantity } from '@/lib/verify/quantities'
import type { PrepContext } from './context'

/**
 * The model's ids are suggestions until code confirms them: a citation of a
 * record this prep was never shown, a requirement that does not exist, or a
 * CV bullet the sent CV lacks is dropped, never shown as if it stood on
 * something. Coverage is computed here, not trusted from the model.
 */
/** A number spelled out is still a number: "¿Fueron treinta días?" plants one. */
const NUMBER_WORD =
  /(?<![\p{L}])(un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|cien|cientos?|mil|millón|millones|doble|duplic\p{L}*|triplic\p{L}*|mitad|por ciento|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand|million|double[ds]?|doubling|triple[ds]?|twice|half|percent)(?![\p{L}])/iu

/** A standalone number: "15%", "2,000", "2010" — not the digit in "1P" or "n8n". */
const FIGURE = /(?<![\p{L}\d])\d+(?:[.,]\d+)*(?![\p{L}\d])/u

/** Most memory prompts one open beat shows. */
const MAX_IDEAS = 3

/**
 * Most questions one story may answer. The audit of 2026-11-24 found one
 * story pointed at five questions it showed nothing about: the readiness bar
 * counted them covered, and telling one story five times reads as having one.
 */
const MAX_ANSWERS_PER_STORY = 2

/** Most questions to ask the interviewer. */
const MAX_ASK_THEM = 5

/**
 * A memory prompt helps him recall; it must never tell him what happened. So
 * it is a question, and it carries no number at all — "¿Bajó de 30 a 10
 * días?" would plant a figure he might then repeat in the room.
 */
function memoryPrompts(ideas: string[]): string[] {
  return ideas
    .map((i) => i.trim())
    .filter((i) => /\?$/.test(i) && !/\d/.test(i) && !NUMBER_WORD.test(i))
    .slice(0, MAX_IDEAS)
}

export function sanitizePrep(raw: ModelPrep, ctx: PrepContext): PrepContent {
  const evidenceIds = new Set([
    ...ctx.evidence.map((e) => e.id),
    ...ctx.answers.map((a) => `answer:${a.id}`),
  ])
  const requirementIds = new Set(ctx.requirements.map((r) => r.id))
  const keywordOf = new Map(ctx.requirements.map((r) => [r.id, r.keyword]))
  // Each card keeps its line's words: the CV can change after the prep.
  const lineOf = new Map(
    ctx.cv
      ? [...ctx.cv.experience, ...ctx.cv.projects].flatMap((s) =>
          s.bullets.map((b) => [b.id, b.text] as const),
        )
      : [],
  )
  // A CV line's figures against the records that line cites: "30% growth" over a
  // record with no figure is a claim he must confirm or drop before the
  // interview, said to him outside what he speaks (audit 2026-11-24).
  const bulletCites = new Map(
    ctx.cv
      ? [...ctx.cv.experience, ...ctx.cv.projects].flatMap((s) =>
          s.bullets.map((b) => [b.id, b.citedEvidenceIds] as const),
        )
      : [],
  )
  const recordOf = new Map(ctx.evidence.map((e) => [e.id, e]))
  const unsupportedIn = (bulletId: string, line: string): string[] => {
    const records = (bulletCites.get(bulletId) ?? []).flatMap((id) => {
      const r = recordOf.get(id)
      return r ? [r] : []
    })
    const allowed = allowedQuantityForms(records)
    return [...new Set(extractQuantities(line).filter((q) => !allowed.has(normaliseQuantity(q))))]
  }
  const cites = (ids: string[]) => [...new Set(ids.filter((id) => evidenceIds.has(id)))]
  const cited = <T extends { text: string; citedEvidenceIds: string[] }>(c: T): T => ({
    ...c,
    text: c.text.trim(),
    citedEvidenceIds: cites(c.citedEvidenceIds),
  })
  // A line that stands on his answer alone is his answer, as he wrote it:
  // the model translating or polishing it put his words in another mouth
  // (review 2026-11-24, a distributor story moved to another employer).
  const answerText = new Map(ctx.answers.map((a) => [`answer:${a.id}`, a.answer.trim()]))
  const verbatim = <T extends { text: string; citedEvidenceIds: string[] }>(c: T): T => {
    const ids = c.citedEvidenceIds
    if (c.text === '' || ids.length === 0 || !ids.every((id) => answerText.has(id))) return c
    return { ...c, text: ids.map((id) => answerText.get(id)).join(' ') }
  }
  const beat = (b: ModelPrep['stories'][number]['situation']) => {
    const out = verbatim(cited(b))
    if (out.text !== '') return { ...out, ask: '', ideas: [] }
    return { ...out, citedEvidenceIds: [], ask: b.ask.trim(), ideas: memoryPrompts(b.ideas) }
  }

  const stories = raw.stories.map((s) => ({
    ...s,
    situation: beat(s.situation),
    task: beat(s.task),
    action: beat(s.action),
    result: beat(s.result),
    short: s.short.map((l) => l.trim()).filter(Boolean),
  }))
  // A gap answer with nothing to admit is not a gap (the record showed the
  // thing): shown, it put "Lo que te falta" over an empty line.
  const gapAnswers = raw.gapAnswers
    .filter((g) => requirementIds.has(g.requirementId) && g.admit.trim() !== '')
    .map((g) => {
      const keyword = keywordOf.get(g.requirementId)
      // His own plan for this gap, when he wrote one, is the plan.
      const his = ctx.answers.find((a) => a.part === 'P' && a.question === keyword)
      return {
        ...g,
        admit: g.admit.trim(),
        plan: his ? his.answer.trim() : g.plan.trim(),
        bridge: cited(g.bridge),
      }
    })
  const storyIds = new Set(stories.map((s) => s.id))
  const gapIds = new Set(gapAnswers.map((g) => g.id))

  // In the model's order (most likely first), each story answers its first
  // questions only; later ones fall back to nothing rather than claim it.
  const answersPerStory = new Map<string, number>()
  const pitch = cited(raw.pitch)
  // A question he already answered himself points to his answer.
  const ownAnswers = new Set(ctx.answers.filter((a) => a.part === 'Q').map((a) => `answer:${a.id}`))
  const answerer = (id: string): string => {
    if (id === 'pitch') return pitch.text !== '' ? id : ''
    if (ownAnswers.has(id)) return id
    if (gapIds.has(id)) return id
    if (!storyIds.has(id)) return ''
    const n = answersPerStory.get(id) ?? 0
    if (n >= MAX_ANSWERS_PER_STORY) return ''
    answersPerStory.set(id, n + 1)
    return id
  }
  const questions = raw.questions.map((q) => ({
    ...q,
    requirementIds: q.requirementIds.filter((id) => requirementIds.has(id)),
    answeredBy: answerer(q.answeredBy),
    // Field knowledge carries no figure: a market share or a fee he repeats
    // in the room must come from somewhere he can check, not from the model.
    // A digit inside a name ("1P", "B2B", "n8n") is not a figure.
    know: FIGURE.test(q.know) ? '' : q.know.trim(),
  }))

  return {
    questions,
    stories,
    cvDefense: raw.cvDefense
      .filter((d) => lineOf.has(d.bulletId))
      .map((d) => {
        const line = lineOf.get(d.bulletId) ?? ''
        const unsupported = unsupportedIn(d.bulletId, line)
        return {
          ...d,
          facts: cited(d.facts),
          line,
          ...(unsupported.length > 0 ? { unsupported } : {}),
        }
      }),
    gapAnswers,
    interviewerNote: raw.interviewerNote.trim(),
    askThem: raw.askThem
      .map((a) => ({ text: a.text.trim(), why: a.why.trim() }))
      .filter((a) => a.text !== '')
      .slice(0, MAX_ASK_THEM),
    pitch,
    coverage: questions.map((q) => ({
      questionId: q.id,
      // The pitch is his material, like a story.
      by:
        storyIds.has(q.answeredBy) || q.answeredBy === 'pitch' || ownAnswers.has(q.answeredBy)
          ? ('story' as const)
          : gapIds.has(q.answeredBy)
            ? ('gap' as const)
            : ('none' as const),
      targetId: q.answeredBy,
    })),
  }
}
