import { z } from 'zod'

export const EvidenceMappingSchema = z.object({
  requirementId: z.string().min(1),
  evidenceIds: z.array(z.string()),
  strength: z.enum(['strong', 'partial', 'none']),
  rationale: z.string(),
})
export type EvidenceMapping = z.infer<typeof EvidenceMappingSchema>

export const MappingResultSchema = z.object({
  mappings: z.array(EvidenceMappingSchema),
})
