import { z } from 'zod'

/**
 * The currencies code recognises in text ("800M COP") and offers in the
 * editor: Latin America first, then the common global ones. A metric may
 * store any ISO 4217 code; this list is only what a reader can spot unaided.
 */
export const CURRENCY_CODES = [
  'MXN',
  'USD',
  'EUR',
  'COP',
  'ARS',
  'CLP',
  'PEN',
  'BRL',
  'UYU',
  'BOB',
  'PYG',
  'CRC',
  'GTQ',
  'DOP',
  'HNL',
  'NIO',
  'PAB',
  'VES',
  'CAD',
  'GBP',
] as const

/**
 * A plain string, not an enum: the grammar cannot enforce an enum, so an
 * MXN/USD/EUR list either failed a Colombian CV's whole paid import or
 * pushed the model to relabel its pesos — a currency swap is a fabrication
 * (2026-11-19 audit). The shape is checked in code (`deriveCurrency`).
 */
export const CurrencySchema = z.string()
export type Currency = z.infer<typeof CurrencySchema>

/** An ISO-4217-shaped code, upper-cased, or undefined when the text is not one. */
export function currencyCode(text: string | undefined): string | undefined {
  const code = text?.trim().toUpperCase()
  return code && /^[A-Z]{3}$/.test(code) ? code : undefined
}

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
  if (metric.currency !== undefined) {
    // Stated: kept in its canonical form, or dropped when it is not a code
    // ("pesos") — omit-and-fall-back, never a failed import.
    const code = currencyCode(metric.currency)
    if (code === metric.currency) return metric
    const { currency: _dropped, ...rest } = metric
    return code ? { ...metric, currency: code } : rest
  }
  const fromUnit = currencyCode(metric.unit)
  return fromUnit && (CURRENCY_CODES as readonly string[]).includes(fromUnit)
    ? { ...metric, currency: fromUnit }
    : metric
}

/**
 * A metric as the model may send it: plain strings only, because the request
 * grammar enforces types and nothing more (CLAUDE.md). `readMetric` turns it
 * into a stored one or drops it.
 */
export const ModelMetricSchema = z.object({
  raw: z.string(),
  value: z.number().optional(),
  unit: z.string().optional(),
  currency: z.string().optional(),
  direction: z.string().optional(),
  subject: z.string().optional(),
})
export type ModelMetric = z.infer<typeof ModelMetricSchema>

/** A stored metric, or null for one with no wording; an unknown direction is left out. */
export function readMetric(m: ModelMetric): Metric | null {
  const raw = m.raw.trim()
  if (!raw) return null
  const direction = m.direction?.trim().toLowerCase()
  const { direction: _given, ...rest } = m
  return deriveCurrency({
    ...rest,
    raw,
    ...(direction === 'up' || direction === 'down' ? { direction } : {}),
  })
}
