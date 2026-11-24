import { z } from 'zod'

export const MappingStrengthSchema = z.enum(['strong', 'partial', 'none'])
export type MappingStrength = z.infer<typeof MappingStrengthSchema>

/** One requirement's mapping, as stored. */
export const EvidenceMappingSchema = z.object({
  requirementId: z.string().min(1),
  evidenceIds: z.array(z.string()),
  strength: MappingStrengthSchema,
  rationale: z.string(),
  /** Set in code, never by the model: the mapper returned nothing for this
   *  requirement, even when asked again. Strength then reads 'none', but for a
   *  gating requirement that would be a judgement nobody made — an invented
   *  "you can't work there" — so coverage shows it as unjudged instead of
   *  letting it gate. */
  unjudged: z.boolean().optional(),
})
export type EvidenceMapping = z.infer<typeof EvidenceMappingSchema>

/**
 * What the mapper returns for one requirement: the stored shape without its
 * constraints. A minLength or an enum is prose to the grammar, so a miss was
 * a fatal invalid-output after the paid call. `readMappings` (map-evidence)
 * reads it instead: a mapping naming no requirement it was asked about is
 * dropped, and a strength it cannot read never becomes claimed support.
 */
const ModelMappingSchema = z.object({
  // Byte for byte what the model read before (see ModelExtractionSchema).
  requirementId: z.string().describe('{minLength: 1}'),
  evidenceIds: z.array(z.string()),
  strength: z.string().describe('{enum: ["strong","partial","none"]}'),
  rationale: z.string(),
})
export type ModelMapping = z.infer<typeof ModelMappingSchema>

export const MappingResultSchema = z.object({
  mappings: z.array(ModelMappingSchema),
})
