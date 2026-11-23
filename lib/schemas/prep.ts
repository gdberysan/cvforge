import { z } from 'zod'

/**
 * Model-facing (spec 2026-10-18 Part B). Only types and required keys are
 * enforced by the grammar, so nothing here carries min/max/enum/refine:
 * every array may come back empty and every id is validated in code
 * (lib/prep/sanitize.ts).
 */
const CitedSchema = z.object({
  text: z.string(),
  citedEvidenceIds: z.array(z.string()),
})

/**
 * One STAR beat. Empty `text` means the evidence lacks it: `ask` then says so
 * plainly, and `ideas` are a few questions to help him recall his own
 * experience — never statements, never a number (enforced in sanitize).
 */
const BeatSchema = CitedSchema.extend({ ask: z.string(), ideas: z.array(z.string()) })

const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  requirementIds: z.array(z.string()),
  why: z.string(),
  /** A story id, a gap-answer id, or ''. */
  answeredBy: z.string(),
  /**
   * For a question that tests knowledge of the field rather than his past
   * ("1P vs 3P", "LGPD"): what to have clear. General knowledge, never a
   * claim about him and never a figure (sanitize blanks one that has a
   * digit). '' for every other question.
   */
  know: z.string(),
})

export const ModelPrepSchema = z.object({
  questions: z.array(QuestionSchema),
  stories: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      situation: BeatSchema,
      task: BeatSchema,
      action: BeatSchema,
      result: BeatSchema,
      short: z.array(z.string()),
    }),
  ),
  cvDefense: z.array(
    z.object({ bulletId: z.string(), likelyQuestion: z.string(), facts: CitedSchema }),
  ),
  gapAnswers: z.array(
    z.object({
      id: z.string(),
      requirementId: z.string(),
      admit: z.string(),
      bridge: CitedSchema,
      plan: z.string(),
    }),
  ),
  interviewerNote: z.string(),
})
export type ModelPrep = z.infer<typeof ModelPrepSchema>

/** Stored: the model's prep after sanitizing, plus the coverage code computed. */
export const PrepContentSchema = ModelPrepSchema.extend({
  /** Older preps were written before `know` existed. */
  questions: z.array(QuestionSchema.extend({ know: z.string().optional() })),
  /** `line`: the CV bullet as it read when the prep was made (older preps lack it). */
  cvDefense: z.array(
    z.object({
      bulletId: z.string(),
      likelyQuestion: z.string(),
      facts: CitedSchema,
      line: z.string().optional(),
    }),
  ),
  coverage: z.array(
    z.object({
      questionId: z.string(),
      by: z.enum(['story', 'gap', 'none']),
      targetId: z.string(),
    }),
  ),
})
export type PrepContent = z.infer<typeof PrepContentSchema>
export type PrepStory = PrepContent['stories'][number]
export const BEATS = ['situation', 'task', 'action', 'result'] as const
