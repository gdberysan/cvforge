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
  companyTone: z.string(),
  requirements: z.array(RequirementSchema),
})
export type ExtractedRequirements = z.infer<typeof ExtractedRequirementsSchema>

/**
 * What the extraction model is actually asked to emit: identical, except
 * weight is a plain number. The union of literals survives only as prose in
 * the enforced grammar, so a model emitting 0 or 4 used to fail the full
 * re-validation and kill the whole paid extraction as invalid-output. The
 * code clamps to 1..3 instead, the same way it already owns the ids.
 */
export const ModelExtractionSchema = ExtractedRequirementsSchema.extend({
  requirements: z.array(RequirementSchema.extend({ weight: z.number() })),
})

/** Unmet gating requirements end a triage decision immediately. */
export const GATING_KINDS: ReadonlySet<RequirementKind> = new Set([
  'location',
  'timezone',
  'authorization',
])
