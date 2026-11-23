import { z } from 'zod'

/** What the mapper returns for one requirement. */
const ModelMappingSchema = z.object({
  requirementId: z.string().min(1),
  evidenceIds: z.array(z.string()),
  strength: z.enum(['strong', 'partial', 'none']),
  rationale: z.string(),
})

export const EvidenceMappingSchema = ModelMappingSchema.extend({
  /** Set in code, never by the model: the mapper returned nothing for this
   *  requirement, even when asked again. Strength then reads 'none', but for a
   *  gating requirement that would be a judgement nobody made — an invented
   *  "you can't work there" — so coverage shows it as unjudged instead of
   *  letting it gate. */
  unjudged: z.boolean().optional(),
})
export type EvidenceMapping = z.infer<typeof EvidenceMappingSchema>

export const MappingResultSchema = z.object({
  mappings: z.array(ModelMappingSchema),
})
