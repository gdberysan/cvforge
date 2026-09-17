import { z } from 'zod'

/**
 * Companion documents. Same grounding contract as the CV: factual claims cite
 * evidence ids. Unlike CV bullets, a paragraph MAY cite nothing — a hook or a
 * close is rhetoric, not a claim — but any paragraph carrying a number with
 * no citation fails verification, so rhetoric cannot smuggle figures.
 */
export const CompanionParagraphSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  citedEvidenceIds: z.array(z.string()),
})
export type CompanionParagraph = z.infer<typeof CompanionParagraphSchema>

export const CoverLetterSchema = z.object({
  paragraphs: z.array(CompanionParagraphSchema).min(1),
})
export type CoverLetter = z.infer<typeof CoverLetterSchema>

export const ScreeningAnswerSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  citedEvidenceIds: z.array(z.string()),
  /** 'user' for a question the person typed themselves; defaults to 'ai' so
   *  documents stored before this field existed still parse. */
  source: z.enum(['ai', 'user']).default('ai'),
})
export type ScreeningAnswer = z.infer<typeof ScreeningAnswerSchema>

export const ScreeningSetSchema = z.object({
  answers: z.array(ScreeningAnswerSchema).min(1),
})
export type ScreeningSet = z.infer<typeof ScreeningSetSchema>

export const RecruiterMessageSchema = z.object({
  text: z.string().min(1),
  citedEvidenceIds: z.array(z.string()),
})
export type RecruiterMessage = z.infer<typeof RecruiterMessageSchema>

export type CompanionKind = 'coverLetter' | 'screening' | 'recruiterMessage'
