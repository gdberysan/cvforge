import { z } from 'zod'

export const GroundingReportSchema = z.object({
  uncitedBullets: z.array(z.string()),
  invalidCitations: z.array(z.object({ bulletId: z.string(), evidenceId: z.string() })),
  unverifiedNumbers: z.array(z.object({ bulletId: z.string(), token: z.string() })),
  /** Soft signal — surfaced for review, does not fail the report. */
  unknownEntities: z.array(z.object({ bulletId: z.string(), entity: z.string() })),
  distortions: z.array(z.object({ bulletId: z.string(), reason: z.string() })),
  /** A bullet asserting a requirement the analysis mapped to nothing. Hard fail:
   *  a claimed gap is the fabrication most likely to cost an offer. Defaults so
   *  reports saved before this check existed still parse. requirementText
   *  defaults to '' so a report saved before it was added still parses too. */
  claimedGaps: z
    .array(
      z.object({
        bulletId: z.string(),
        keyword: z.string(),
        requirementText: z.string().default(''),
      }),
    )
    .default([]),
  passed: z.boolean(),
})
export type GroundingReport = z.infer<typeof GroundingReportSchema>
