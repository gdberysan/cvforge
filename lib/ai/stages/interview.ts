import { randomUUID } from 'node:crypto'
import { stripUngroundedMetrics } from '@/lib/interview/ground'
import {
  deriveCurrency,
  type EvidenceItem,
  type Experience,
  type InterviewAnswer,
  InterviewPlanSchema,
  type InterviewQuestion,
  InterviewResultSchema,
} from '@/lib/schemas'
import { callStructured } from '../client'

const MAX_QUESTIONS = 6

const PLAN_SYSTEM = `You interview someone about one job they held, to recover detail their CV threw away.

A CV bullet is compressed and trimmed. Your questions recover what it lost: what the situation actually was, what THIS PERSON did as opposed to their team, what changed as a result, and any numbers they remember.

Rules:
1. Ask at most ${MAX_QUESTIONS} questions for this role. Fewer is fine. Respect their time — they have many roles to get through.
2. Prefer questions attached to a specific stub (set targetStubId). Use a role-level question (targetStubId: null) only for work the stubs do not mention at all. "What else did you do here that never made it onto your CV?" is often the single most valuable question you can ask.
3. Ask ONE thing per question. Never stack "what did you do and what was the result?" into one.
4. Ask plainly, as a curious colleague would. No jargon, no leading, no flattery.
5. Never ask something the stub already answers. When an <already-recorded> block is present, those records exist in full — never re-ask about work they already cover; recover only what is still missing.
6. When probing for a number, make it easy to answer honestly: ask what they remember, and make clear that a rough figure or "I don't remember" is a fine answer. Never pressure for a number.
7. "why" explains in one short sentence what a good answer unlocks. It is shown to them as a hint.`

const STRUCTURE_SYSTEM = `You convert an interview transcript into structured career evidence.

THE GROUNDING RULE — this outranks everything else:
Use only what the person actually said, plus the original stubs. Never add scope, outcomes, technologies, or numbers they did not state.

NUMBERS — the rule that matters most:
Only record a metric when they stated an actual figure. A vague answer produces NO metric. "It got a lot faster" is not 40%. "We roughly doubled it" is not 100%. If they gave a range, record the range as they said it. If they said they do not remember, record no metric. An invented number here is worse than no number: everything downstream treats recorded metrics as verified truth.

MONEY: when a figure is money, set both unit and currency (MXN, USD, or EUR). If they did not say which, infer from context — a Mexican employer implies MXN — and keep their exact phrasing in "raw" so they can correct it.

WRITING THE EVIDENCE:
- "text" is the full, unabridged record: what they did, in their own register, with the detail they gave. This is NOT a CV bullet. Do not compress it, do not bolt on an action verb, do not make it sound impressive. A later stage writes the CV; this is the raw material.
- Prefer their own words and phrasing over your paraphrase.
- One evidence item per distinct achievement. Merge a stub with the answers that expanded it rather than duplicating it.
- Tag each item with the skills and technologies it actually evidences.
- strength "core" for substantial work, "supporting" for smaller contributions.
- "period" uses YYYY-MM. Only set it when the answers themselves date the work; if they do not, omit it entirely — the role's own dates are used. Never invent a month.
- When an <already-recorded> block is present, those records exist in full. Never restate work they already cover: record only what these answers add. If the answers add nothing new, return no evidence for that work.
- Assign ids "ev_new_1", "ev_new_2", … They will be replaced.`

export async function planInterview(args: {
  role: Experience
  stubs: EvidenceItem[]
  /** Real records already on file for this role — context, never scaffolding. */
  existing?: EvidenceItem[]
  /** The UI language — questions must meet the person where they think. */
  locale?: 'en' | 'es'
}): Promise<InterviewQuestion[]> {
  const stubBlock = args.stubs.length
    ? args.stubs.map((s) => `${s.id}: ${s.text}`).join('\n')
    : '(no achievements recorded for this role yet)'

  const existing = args.existing ?? []
  // In the user block, not the system prompt: the system block stays
  // byte-stable while per-user settings ride with the volatile content.
  const language =
    args.locale === 'es'
      ? 'Write every question and its "why" hint in Mexican Spanish — the person is using the app in Spanish.'
      : ''

  const result = await callStructured({
    schema: InterviewPlanSchema,
    system: [{ text: PLAN_SYSTEM, cache: true }],
    user: [
      '<role>',
      `${args.role.title} at ${args.role.company}`,
      `${args.role.period.start}–${args.role.period.end ?? 'present'}`,
      '</role>',
      '',
      '<stubs>',
      stubBlock,
      '</stubs>',
      ...(existing.length
        ? ['', '<already-recorded>', existing.map((e) => e.text).join('\n'), '</already-recorded>']
        : []),
      ...(language ? ['', language] : []),
    ].join('\n'),
    effort: 'medium',
    stage: 'interview-plan',
  })

  return result.questions.slice(0, MAX_QUESTIONS)
}

export async function structureAnswers(args: {
  role: Experience
  stubs: EvidenceItem[]
  /**
   * Records already on file for this role — context, never scaffolding. Without
   * it, answering the same gap for two different postings records the same work
   * twice, and the CV composer is left guessing which copy to believe.
   * `planInterview` has carried this for the same reason since it shipped.
   */
  existing?: EvidenceItem[]
  answers: InterviewAnswer[]
}): Promise<{ evidence: EvidenceItem[]; dropped: { evidenceId: string; raw: string }[] }> {
  const transcript = args.answers
    .filter((a) => a.answer.trim().length > 0)
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n')

  const existing = args.existing ?? []

  const result = await callStructured({
    schema: InterviewResultSchema,
    system: [{ text: STRUCTURE_SYSTEM, cache: true }],
    user: [
      `<role>${args.role.title} at ${args.role.company} (${args.role.period.start}–${args.role.period.end ?? 'present'})</role>`,
      '',
      '<stubs>',
      args.stubs.map((s) => `${s.id}: ${s.text}`).join('\n') || '(none)',
      '</stubs>',
      ...(existing.length
        ? ['', '<already-recorded>', existing.map((e) => e.text).join('\n'), '</already-recorded>']
        : []),
      '',
      '<transcript>',
      transcript,
      '</transcript>',
    ].join('\n'),
    effort: 'high',
    stage: 'interview-structure',
  })

  // Ownership and ids are ours, not the model's: evidence produced by this
  // interview belongs to this role, and fresh ids mean re-running an interview
  // can never overwrite records the user already has.
  const owned = result.evidence.map((item) => ({
    ...item,
    id: `ev_${randomUUID().slice(0, 8)}`,
    sourceRef: { type: 'experience' as const, id: args.role.id },
    period: item.period ?? args.role.period,
    origin: 'interview' as const,
    // A unit that names a currency IS the currency; filled here so the
    // review screen shows what will actually be stored.
    metrics: item.metrics.map(deriveCurrency),
  }))

  // The user's own words are the only source a metric may come from — the
  // ANSWERS, never the questions. "Was it around 30%?" / "roughly, yes" must
  // not record 30%: the figure came from the interviewer.
  const sourceText = [...args.answers.map((a) => a.answer), ...args.stubs.map((s) => s.text)].join(
    '\n',
  )
  return stripUngroundedMetrics(owned, sourceText)
}
