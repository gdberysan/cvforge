import { z } from 'zod'

export const CurrencySchema = z.enum(['MXN', 'USD', 'EUR'])
export type Currency = z.infer<typeof CurrencySchema>

/**
 * Metrics are structured, not free text, because the grounding verifier
 * compares numbers in generated bullets against these records. `currency` is
 * mandatory for money units: "$1.2M" is ambiguous between MXN and USD by ~17x,
 * and a currency swap is a fabrication the candidate would have to defend.
 */
export const MetricSchema = z.object({
  raw: z.string().min(1),
  value: z.number().optional(),
  unit: z.string().optional(),
  currency: CurrencySchema.optional(),
  direction: z.enum(['up', 'down']).optional(),
  subject: z.string().optional(),
})

export type Metric = z.infer<typeof MetricSchema>

/**
 * Currency recovered instead of demanded.
 *
 * This used to be a `.refine()` requiring `currency` whenever `unit` named
 * one. zodOutputFormat drops refines from the enforced grammar (a transform
 * it rejects outright) while the local re-validation applies the full schema
 * — so the rule could only ever fire AFTER a paid model call, killing
 * interview structuring, gap-fill drafting, or a CV import whenever the model
 * wrote `unit: "MXN"` and skipped the redundant field. And redundant is the
 * word: the refine only fired when the unit itself named the currency, which
 * is exactly the case where deriving it is reading, not inventing.
 *
 * Applied at every point a metric enters the system — the model landing sites
 * (structureAnswers, toParsedCV) and the storage choke point (upsertEvidence)
 * — so the guarantee downstream consumers rely on (compose prints
 * `[currency=…]`, the verifier builds value+currency forms) still holds.
 */
export function deriveCurrency(metric: Metric): Metric {
  if (metric.currency || !metric.unit) return metric
  const canonical = CurrencySchema.safeParse(metric.unit.toUpperCase())
  return canonical.success ? { ...metric, currency: canonical.data } : metric
}
