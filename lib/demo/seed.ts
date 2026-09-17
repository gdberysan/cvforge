import { z } from 'zod'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import type { Db } from '@/lib/db/client'
import { upsertAnswer } from '@/lib/db/queries/answers'
import {
  appendOutcome,
  createApplication,
  mergeDocuments,
  saveDocuments,
  setArchived,
} from '@/lib/db/queries/applications'
import { upsertEvidence } from '@/lib/db/queries/evidence'
import { saveProfile } from '@/lib/db/queries/profile'
import { hashEvidenceProjection } from '@/lib/hash'
import {
  CoverageSchema,
  EvidenceItemSchema,
  EvidenceMappingSchema,
  GroundingReportSchema,
  InterviewQuestionSchema,
  MarketSchema,
  MasterProfileSchema,
  OutcomeEventSchema,
  RequirementSchema,
  SourceSchema,
} from '@/lib/schemas'

/**
 * The demo's frozen state (product spec §5.3). Produced once by
 * `npm run demo:build` from the real pipeline; loaded into an in-memory
 * database on every demo process through the SAME query layer the app
 * uses, so statuses, hashes and cascades come out exactly as they would live.
 */
export const SeedSchema = z.object({
  builtAt: z.string(),
  profile: MasterProfileSchema,
  evidence: z.array(EvidenceItemSchema),
  applications: z.array(
    z.object({
      id: z.string(),
      source: SourceSchema,
      sourceUrl: z.string().optional(),
      company: z.string(),
      jobTitle: z.string(),
      market: MarketSchema,
      documentLanguage: z.enum(['en', 'es-MX']),
      postingRaw: z.string(),
      postingHash: z.string(),
      evidenceHash: z.string(),
      requirements: z.array(RequirementSchema),
      mappings: z.array(EvidenceMappingSchema),
      coverage: CoverageSchema,
      documents: z.record(z.string(), z.unknown()).nullable(),
      groundingReport: GroundingReportSchema.nullable(),
      outcomes: z.array(OutcomeEventSchema),
      archived: z.boolean(),
    }),
  ),
  answers: z.array(
    z.object({ question: z.string(), answer: z.string(), language: z.enum(['en', 'es-MX']) }),
  ),
  interviewPlans: z.record(z.string(), z.array(InterviewQuestionSchema)),
})
export type Seed = z.infer<typeof SeedSchema>

export function loadSeed(db: Db, seed: Seed): void {
  saveProfile(db, seed.profile)
  seed.evidence.forEach((item, i) => {
    upsertEvidence(db, item, i)
  })

  // The stored hash was computed by the projection of the day the seed was
  // built; the running code's projection may differ (new fields). Recompute
  // so seeded applications are never shown as stale in the demo.
  const evidenceHash = hashEvidenceProjection(buildEvidenceProjection(seed.profile, seed.evidence))

  for (const app of seed.applications) {
    createApplication(db, {
      id: app.id,
      source: app.source,
      sourceUrl: app.sourceUrl,
      company: app.company,
      jobTitle: app.jobTitle,
      market: app.market,
      documentLanguage: app.documentLanguage,
      postingRaw: app.postingRaw,
      postingHash: app.postingHash,
      evidenceHash,
      requirements: app.requirements,
      mappings: app.mappings,
      coverage: app.coverage,
    })
    if (app.documents) {
      const { cv, ...companions } = app.documents
      // A CV is only storable with its grounding report; dropping it silently
      // here would surface far away as a missing demo document. A malformed
      // seed must fail where the demo:build author can see it.
      if (cv && !app.groundingReport) {
        throw new Error(
          `demo seed: ${app.id} has a CV but no grounding report — rebuild with npm run demo:build`,
        )
      }
      if (cv && app.groundingReport) saveDocuments(db, app.id, { cv }, app.groundingReport)
      if (Object.keys(companions).length > 0) mergeDocuments(db, app.id, companions)
    }
    for (const outcome of app.outcomes) appendOutcome(db, app.id, outcome)
    if (app.archived) setArchived(db, app.id, true)
  }

  for (const answer of seed.answers) upsertAnswer(db, answer)
}
