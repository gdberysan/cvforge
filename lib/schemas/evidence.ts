import { z } from 'zod'
import { MetricSchema, ModelMetricSchema, readMetric } from './metric'

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

/**
 * An evidence item as the model may send it (CV import, interview, gap-fill):
 * types only, because the request grammar enforces nothing else — an enum, a
 * minimum length or a month pattern lived only in the local re-validation and
 * failed a paid call with no retry. `readModelEvidence` makes it a stored one.
 */
export const ModelEvidenceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  sourceRef: z.object({ type: z.string(), id: z.string() }),
  text: z.string(),
  metrics: z.array(ModelMetricSchema),
  tags: z.array(z.string()),
  period: z.object({ start: z.string().optional(), end: z.string().optional() }).optional(),
  strength: z.string(),
})
export type ModelEvidence = z.infer<typeof ModelEvidenceSchema>

const KINDS = EvidenceKindSchema.options
const SOURCE_TYPES = SourceRefSchema.shape.type.options

/**
 * The stored fields of a model-sent item, or why it cannot be stored: no
 * text says nothing, and a source type outside the four cannot be placed.
 * An unknown kind reads as an achievement and an unknown strength as
 * supporting — the weakest claim, never a stronger one. Ids and periods stay
 * the caller's: each landing site owns them.
 */
export function readModelEvidence(
  item: ModelEvidence,
):
  | { ok: true; fields: Omit<EvidenceItem, 'id' | 'period' | 'origin'> }
  | { ok: false; reason: 'empty' | 'unplaceable' } {
  const text = item.text.trim()
  if (!text) return { ok: false, reason: 'empty' }
  const type = item.sourceRef.type.trim().toLowerCase()
  if (!(SOURCE_TYPES as readonly string[]).includes(type) || !item.sourceRef.id.trim())
    return { ok: false, reason: 'unplaceable' }
  const kind = item.kind.trim().toLowerCase()
  return {
    ok: true,
    fields: {
      kind: (KINDS as readonly string[]).includes(kind) ? (kind as EvidenceKind) : 'achievement',
      sourceRef: { type: type as SourceRef['type'], id: item.sourceRef.id.trim() },
      text,
      metrics: item.metrics.flatMap((m) => readMetric(m) ?? []),
      tags: item.tags,
      strength: item.strength.trim().toLowerCase() === 'core' ? 'core' : 'supporting',
    },
  }
}

/** A month the model sent, if it is one; otherwise undefined (the caller falls back). */
export function readMonth(text: string | undefined): string | undefined {
  const month = text?.trim()
  return month && MonthSchema.safeParse(month).success ? month : undefined
}
