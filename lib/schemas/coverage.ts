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
  /** Gating requirements the mapper never judged, even when asked twice.
   *  Not blockers — nothing found them unmet — but nothing found them met
   *  either, so the person is told to check them. Optional, not defaulted:
   *  coverage stored before this field still parses, and code that builds a
   *  Coverage by hand (the job-agent satellite's fixtures) need not know it.
   *  Read it as `?? []`; computeCoverage always sets it. */
  unjudgedGates: z.array(RequirementSchema).optional(),
  verdict: VerdictSchema,
})
export type Coverage = z.infer<typeof CoverageSchema>
