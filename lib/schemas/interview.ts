import { z } from 'zod'
import { ModelEvidenceSchema } from './evidence'

const PROBES = ['scope', 'action', 'outcome', 'metric', 'context'] as const

export const InterviewQuestionSchema = z.object({
  id: z.string().min(1),
  /** Which stub this expands. null means a role-level question. */
  targetStubId: z.string().nullable(),
  question: z.string().min(1),
  /** Shown as a hint, so the user knows what a good answer unlocks. */
  why: z.string(),
  probesFor: z.enum(PROBES),
})
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>

/**
 * What the model returns: plain strings only. The request grammar enforces
 * types alone, so the app's own shape (non-empty text, a closed probe list,
 * null for a role-level question) is read in code by `readInterviewPlan`.
 * targetStubId is '' for a role-level question rather than null: zod 4.6
 * emits a nullable string as `type: [string, null]`, and an empty string
 * keeps the grammar a plain `type: string`.
 */
export const InterviewPlanSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      targetStubId: z.string(),
      question: z.string(),
      why: z.string(),
      probesFor: z
        .string()
        .describe('What the question draws out: scope, action, outcome, metric or context.'),
    }),
  ),
})

/** Questions with no text are dropped; an unknown probe reads as 'context'. */
export function readInterviewPlan(raw: z.infer<typeof InterviewPlanSchema>): InterviewQuestion[] {
  const out: InterviewQuestion[] = []
  for (const [i, q] of raw.questions.entries()) {
    const question = q.question.trim()
    if (!question) continue
    const probe = q.probesFor.trim().toLowerCase()
    out.push({
      id: q.id.trim() || `q${i + 1}`,
      targetStubId: q.targetStubId.trim() || null,
      question,
      why: q.why.trim(),
      probesFor: (PROBES as readonly string[]).includes(probe)
        ? (probe as InterviewQuestion['probesFor'])
        : 'context',
    })
  }
  return out
}

export const InterviewAnswerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
})
export type InterviewAnswer = z.infer<typeof InterviewAnswerSchema>

export const InterviewResultSchema = z.object({
  /** Period optional at the model boundary: an interview answer often does
   *  not date the work, and a required YYYY-MM start forced the model to
   *  invent a month or die as invalid-output — which also made
   *  structureAnswers' `item.period ?? role.period` fallback dead code.
   *  Omission now takes the role's own dates, which is the honest answer.
   *  Everything else is loose too (ModelEvidenceSchema): a month pattern or
   *  a closed list was the same fatal prose; structureAnswers reads it. */
  evidence: z.array(ModelEvidenceSchema),
})
