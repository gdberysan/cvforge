import type { ModelPrep, PrepContent } from '@/lib/schemas/prep'
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
  // Each card keeps its line's words: the CV can change after the prep.
  const lineOf = new Map(
    ctx.cv
      ? [...ctx.cv.experience, ...ctx.cv.projects].flatMap((s) =>
          s.bullets.map((b) => [b.id, b.text] as const),
        )
      : [],
  )
  const cites = (ids: string[]) => [...new Set(ids.filter((id) => evidenceIds.has(id)))]
  const cited = <T extends { text: string; citedEvidenceIds: string[] }>(c: T): T => ({
    ...c,
    text: c.text.trim(),
    citedEvidenceIds: cites(c.citedEvidenceIds),
  })
  const beat = (b: ModelPrep['stories'][number]['situation']) => {
    const out = cited(b)
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
  const gapAnswers = raw.gapAnswers
    .filter((g) => requirementIds.has(g.requirementId))
    .map((g) => ({ ...g, bridge: cited(g.bridge) }))
  const storyIds = new Set(stories.map((s) => s.id))
  const gapIds = new Set(gapAnswers.map((g) => g.id))

  const questions = raw.questions.map((q) => ({
    ...q,
    requirementIds: q.requirementIds.filter((id) => requirementIds.has(id)),
    answeredBy: storyIds.has(q.answeredBy) || gapIds.has(q.answeredBy) ? q.answeredBy : '',
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
      .map((d) => ({ ...d, facts: cited(d.facts), line: lineOf.get(d.bulletId) })),
    gapAnswers,
    interviewerNote: raw.interviewerNote.trim(),
    coverage: questions.map((q) => ({
      questionId: q.id,
      by: storyIds.has(q.answeredBy)
        ? ('story' as const)
        : gapIds.has(q.answeredBy)
          ? ('gap' as const)
          : ('none' as const),
      targetId: q.answeredBy,
    })),
  }
}
