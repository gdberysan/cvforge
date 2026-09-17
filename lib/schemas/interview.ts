import { z } from 'zod'
import { EvidenceItemSchema, PeriodSchema } from './evidence'

export const InterviewQuestionSchema = z.object({
  id: z.string().min(1),
  /** Which stub this expands. null means a role-level question. */
  targetStubId: z.string().nullable(),
  question: z.string().min(1),
  /** Shown as a hint, so the user knows what a good answer unlocks. */
  why: z.string(),
  probesFor: z.enum(['scope', 'action', 'outcome', 'metric', 'context']),
})
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>

export const InterviewPlanSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
})

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
   *  Omission now takes the role's own dates, which is the honest answer. */
  evidence: z.array(EvidenceItemSchema.extend({ period: PeriodSchema.optional() })),
})
