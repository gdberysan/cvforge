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

export const ScreeningSetSchema = z.object({
  answers: z.array(ScreeningAnswerSchema).min(1),
})
export type ScreeningSet = z.infer<typeof ScreeningSetSchema>

export const RecruiterMessageSchema = z.object({
  text: z.string().min(1),
  citedEvidenceIds: z.array(z.string()),
})
export type RecruiterMessage = z.infer<typeof RecruiterMessageSchema>

/**
 * What the model is asked for. The stored schemas above keep their minimums,
 * but the request grammar can carry a minLength or a minItems only as prose
 * (and an enum only as prose), so demanding them of the model turned a miss
 * into a fatal invalid-output after the paid call. These carry no
 * constraints, and no `source` — that is the code's to set. The readers in
 * compose-companion settle the rest: an item with no text is dropped, a
 * missing id is numbered, and a document left with nothing is an error the
 * person sees, never padded.
 */
// What the model reads is what it read before: the old constraints stay as
// descriptions the grammar never enforces (see ModelExtractionSchema), and
// minItems, which the grammar does enforce, stays a real rule.
const ModelParagraphSchema = z.object({
  id: z.string().describe('{minLength: 1}'),
  text: z.string().describe('{minLength: 1}'),
  citedEvidenceIds: z.array(z.string()),
})

export const ModelCoverLetterSchema = z.object({
  paragraphs: z.array(ModelParagraphSchema).min(1),
})
export type ModelCoverLetter = z.infer<typeof ModelCoverLetterSchema>

export const ModelScreeningAnswerSchema = z.object({
  id: z.string().describe('{minLength: 1}'),
  question: z.string().describe('{minLength: 1}'),
  answer: z.string().describe('{minLength: 1}'),
  citedEvidenceIds: z.array(z.string()),
  // Asked for as before; the code sets the real value ('ai' or 'user') itself.
  source: z.string().describe('{default: "ai", enum: ["ai","user"]}'),
})
export type ModelScreeningAnswer = z.infer<typeof ModelScreeningAnswerSchema>

export const ModelScreeningSetSchema = z.object({
  answers: z.array(ModelScreeningAnswerSchema).min(1),
})
export type ModelScreeningSet = z.infer<typeof ModelScreeningSetSchema>

export const ModelRecruiterMessageSchema = z.object({
  text: z.string().describe('{minLength: 1}'),
  citedEvidenceIds: z.array(z.string()),
})
export type ModelRecruiterMessage = z.infer<typeof ModelRecruiterMessageSchema>

export type CompanionKind = 'coverLetter' | 'screening' | 'recruiterMessage'
