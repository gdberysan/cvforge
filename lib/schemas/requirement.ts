import { z } from 'zod'

export const RequirementKindSchema = z.enum([
  'hard',
  'soft',
  /** Gating kinds — no amount of CV tailoring can satisfy these. */
  'location',
  'timezone',
  'authorization',
])
export type RequirementKind = z.infer<typeof RequirementKindSchema>

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  keyword: z.string().min(1),
  variants: z.array(z.string()),
  kind: RequirementKindSchema,
  mandatory: z.boolean(),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})
export type Requirement = z.infer<typeof RequirementSchema>

export const ExtractedRequirementsSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  language: z.enum(['en', 'es-MX']),
  requirements: z.array(RequirementSchema),
})
export type ExtractedRequirements = z.infer<typeof ExtractedRequirementsSchema>

/**
 * What the extraction model is actually asked to emit: the same fields with
 * none of the constraints. The grammar enforces only types and required keys,
 * so a minLength, an enum or a union of literals is prose the model can miss,
 * and a miss used to kill the whole paid extraction as invalid-output at the
 * local re-validation. `readExtraction` (extract-requirements) owns all of it
 * in code: ids renumbered, weight clamped to 1..3, an unknown kind read as
 * 'hard', the language read (or derived from the posting), and a requirement
 * with no wording at all dropped.
 */
export const ModelExtractionSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  // What the model reads is byte for byte what it read before the schema was
  // loosened: the old constraints stay as descriptions (prose the grammar
  // never enforces), and only the local parse stopped failing on them.
  // Dropping them changed extraction on the eval (2026-11-23): real
  // must-haves marked optional, a 0-of-N mandatory read on another posting.
  language: z.string().describe('{enum: ["en","es-MX"]}'),
  requirements: z.array(
    z.object({
      id: z.string().describe('{minLength: 1}'),
      text: z.string().describe('{minLength: 1}'),
      keyword: z.string().describe('{minLength: 1}'),
      variants: z.array(z.string()),
      kind: z.string().describe('{enum: ["hard","soft","location","timezone","authorization"]}'),
      mandatory: z.boolean(),
      weight: z.number(),
    }),
  ),
})
export type ModelExtraction = z.infer<typeof ModelExtractionSchema>

/** Unmet gating requirements end a triage decision immediately. */
export const GATING_KINDS: ReadonlySet<RequirementKind> = new Set([
  'location',
  'timezone',
  'authorization',
])
