import type { PrepContent } from '@/lib/schemas/prep'

/**
 * Where each question stands, read the same way by the meter and by the
 * question groups, so the two can never disagree (review 2026-11-24: the
 * meter said "0 with an honest answer" beside an honest answer on the page).
 *
 * - story: a story of his, the pitch, or his own written answer.
 * - gap: a requirement he lacks, with what to say about it, whether the
 *   model linked the question to the gap card or the question only names
 *   that requirement, or he wrote his own plan for it.
 * - personal: nothing in a record could answer it (why this company,
 *   salary, start date): his to write, never "add it to your experience".
 * - none: a question about work his records don't show yet.
 */
export type Standing = 'story' | 'gap' | 'personal' | 'none'

type Answer = { id: string; part: string; question: string }
type Question = PrepContent['questions'][number]

/** Questions no record answers: motive, conditions, timing. */
const PERSONAL =
  /\b(?:salar(?:y|io)|compensation|sueldo|pretensi[oó]n|expectations?|expectativas?|start|empezar|incorporarte|notice|aviso|disponib|relocat|mudarte|why (?:this|our|do you want)|por qu[eé] (?:esta|este|quieres|te interesa)|what have you been doing since|qu[eé] has (?:estado )?hecho desde)\b/iu

export function standings(
  content: PrepContent,
  answers: Answer[],
  keywordOf: Map<string, string>,
): Map<string, { by: Standing; gapId?: string }> {
  const stories = new Set(content.stories.map((s) => s.id))
  const gapByReq = new Map(content.gapAnswers.map((g) => [g.requirementId, g.id]))
  const gapIds = new Set(content.gapAnswers.map((g) => g.id))
  const ownPlan = new Set(answers.filter((a) => a.part === 'P').map((a) => a.question))
  const out = new Map<string, { by: Standing; gapId?: string }>()
  for (const q of content.questions) out.set(q.id, standingOf(q))
  return out

  function standingOf(q: Question): { by: Standing; gapId?: string } {
    const a = q.answeredBy
    if (a === 'pitch' || stories.has(a)) return { by: 'story' }
    if (a.startsWith('answer:') && answers.some((x) => `answer:${x.id}` === a))
      return { by: 'story' }
    if (answers.some((x) => x.part === 'Q' && x.question === q.text)) return { by: 'story' }
    if (gapIds.has(a)) return { by: 'gap', gapId: a }
    for (const r of q.requirementIds) {
      const g = gapByReq.get(r)
      if (g) return { by: 'gap', gapId: g }
      const k = keywordOf.get(r)
      if (k && ownPlan.has(k)) return { by: 'gap' }
    }
    if (q.requirementIds.length === 0 || PERSONAL.test(q.text)) return { by: 'personal' }
    return { by: 'none' }
  }
}
