import { z } from 'zod'
import { MetricSchema } from './metric'

export const EvidenceKindSchema = z.enum([
  'achievement',
  'project-highlight',
  'credential',
  'skill-claim',
])
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>

export const SourceRefSchema = z.object({
  type: z.enum(['experience', 'project', 'education', 'certification']),
  id: z.string().min(1),
})
export type SourceRef = z.infer<typeof SourceRefSchema>

/** `YYYY-MM`, the granularity CVs actually use. */
export const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/)

export const PeriodSchema = z.object({
  start: MonthSchema,
  end: MonthSchema.optional(),
})
export type Period = z.infer<typeof PeriodSchema>

/**
 * The core asset. An achievement is not a string hanging off an experience —
 * it is a first-class, addressable record that generated CV bullets cite.
 */
/**
 * Where this record came from. `import` means it is still a CV stub —
 * compressed, trimmed, and not yet interrogated. Without this, no part of the
 * UI can tell an unexpanded role from a finished one, which is exactly the
 * step users skip.
 *
 * `gap-fill` means the user wrote it in response to a specific job requirement
 * the analysis mapped to nothing. Kept distinct from `manual` so evidence
 * recalled under the pressure of a posting stays auditable against evidence
 * volunteered freely — the one honest answer to a flow that asks "do you
 * actually have X?" at the exact moment X is demanded.
 */
export const EvidenceOriginSchema = z.enum(['import', 'interview', 'manual', 'gap-fill'])
export type EvidenceOrigin = z.infer<typeof EvidenceOriginSchema>

export const EvidenceItemSchema = z.object({
  id: z.string().min(1),
  kind: EvidenceKindSchema,
  sourceRef: SourceRefSchema,
  /** Full, unabridged truth. Never shown verbatim in a CV. */
  text: z.string().min(1),
  metrics: z.array(MetricSchema),
  tags: z.array(z.string()),
  period: PeriodSchema,
  strength: z.enum(['core', 'supporting']),
  origin: EvidenceOriginSchema.default('manual'),
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>
