import { z } from 'zod'
import { RequirementSchema } from './requirement'

export const VerdictSchema = z.enum(['strong', 'worth-it', 'stretch', 'skip'])
export type Verdict = z.infer<typeof VerdictSchema>

export const CoverageSchema = z.object({
  mandatoryTotal: z.number().int().nonnegative(),
  mandatoryStrong: z.number().int().nonnegative(),
  mandatoryPartial: z.number().int().nonnegative(),
  mandatoryMissing: z.number().int().nonnegative(),
  desirableTotal: z.number().int().nonnegative(),
  desirableStrong: z.number().int().nonnegative(),
  desirablePartial: z.number().int().nonnegative(),
  desirableMissing: z.number().int().nonnegative(),
  hardBlockers: z.array(RequirementSchema),
  verdict: VerdictSchema,
})
export type Coverage = z.infer<typeof CoverageSchema>
