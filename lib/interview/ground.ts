import type { EvidenceItem, Metric } from '@/lib/schemas'

/**
 * Magnitude words a person types after a number. "mil" is Spanish for a
 * thousand — it is NOT a million, and reading it as "M" once let a 12,000
 * peso budget ground a twelve-million-peso claim.
 */
const MAGNITUDE: Record<string, number> = {
  k: 1e3,
  mil: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  millon: 1e6,
  millones: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
}

/**
 * A number as typed, with the magnitude word that immediately follows it.
 * The lookbehind keeps identifiers whole ("p95", "v2.0") and the trailing
 * lookahead keeps "5 men" from reading as five million.
 */
const TOKEN =
  /(?<![\p{L}\d])(?<num>\d[\d,.]*)(?:\s?(?<mag>millones|millón|millon|million|billion|mil|mm|mn|bn|k|m|b)(?![\p{L}]))?/giu

/**
 * Every value a written number can honestly mean. "1,500" is fifteen hundred
 * in en-US and es-MX but one and a half in Spain; "1.500" is the reverse.
 * Returning both readings keeps a metric the user did state from being
 * dropped over punctuation, while an inflated one still matches nothing.
 */
function readings(num: string): number[] {
  const trimmed = num.replace(/[,.]+$/, '')
  if (!trimmed) return []
  const out = new Set<number>()
  const push = (n: number) => {
    if (Number.isFinite(n)) out.add(n)
  }

  // Grouped thousands: every separator followed by exactly three digits.
  if (/^\d{1,3}(?:[,.]\d{3})+$/.test(trimmed)) {
    push(Number(trimmed.replace(/[,.]/g, '')))
    // A single separator with three digits after it is also a valid decimal.
    const single = trimmed.match(/^(\d{1,3})[,.](\d{3})$/)
    if (single) push(Number(`${single[1]}.${single[2]}`))
    return [...out]
  }

  // One separator, one or two digits after it: a decimal in either locale.
  const decimal = trimmed.match(/^(\d+)[,.](\d{1,2})$/)
  if (decimal) {
    push(Number(`${decimal[1]}.${decimal[2]}`))
    return [...out]
  }

  // Mixed "1,200,000.50": commas group, the last dot is the decimal point.
  if (/^[\d,]+\.\d+$/.test(trimmed)) {
    push(Number(trimmed.replace(/,/g, '')))
    return [...out]
  }

  push(Number(trimmed.replace(/[,.]/g, '')))
  return [...out]
}

/** Numbers a piece of text asserts, scaled by any magnitude word. */
function valuesOf(text: string, mode: 'source' | 'claim'): number[] {
  const values: number[] = []
  for (const match of text.matchAll(TOKEN)) {
    const num = match.groups?.num ?? ''
    const mag = match.groups?.mag
      ?.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const scale = mag ? (MAGNITUDE[mag] ?? 1) : 1
    for (const base of readings(num)) {
      // What the user typed can be read at face value as well as scaled: they
      // may have said "1.2 millones" and the model stored value 1.2 with the
      // unit spelled out. A claim, though, means exactly what it says — "1.2M"
      // is one million two hundred thousand, never one point two.
      if (mode === 'source' || !mag) values.push(base)
      if (mag) values.push(base * scale)
    }
  }
  return values
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

function isGrounded(metric: Metric, sourceValues: number[]): boolean {
  // Each token of the metric's own wording is one claim; a token with several
  // readings is grounded when any reading was said.
  const claims: number[][] = []
  for (const match of metric.raw.matchAll(TOKEN)) {
    const alternatives = valuesOf(match[0], 'claim')
    if (alternatives.length > 0) claims.push(alternatives)
  }
  if (metric.value !== undefined) claims.push([metric.value])

  // No numeric claim means nothing could have been invented.
  if (claims.length === 0) return true

  // Every number the metric asserts must be a number the user actually said —
  // the same number, not a power of ten away from it. Zero-extension used to
  // be accepted so "1.2M" could match "1,200,000"; that also let "18%" ground
  // "180%", "1.8%" ground "18%", and a "team of 1" ground "100%".
  return claims.every((alternatives) =>
    alternatives.some((claim) => sourceValues.some((said) => sameValue(claim, said))),
  )
}

/**
 * Drops metrics the user never actually stated.
 *
 * The prompt tells the model not to invent numbers from vague answers — "it got
 * a lot faster" is not 40%. This enforces it. Recorded metrics are treated as
 * ground truth by the grounding verifier in Phase 3, so a single invented
 * figure here would silently authorise a fabricated CV bullet weeks later, and
 * every downstream check would pass.
 */
export function stripUngroundedMetrics(
  evidence: EvidenceItem[],
  sourceText: string,
): { evidence: EvidenceItem[]; dropped: { evidenceId: string; raw: string }[] } {
  const sourceValues = valuesOf(sourceText, 'source')
  const dropped: { evidenceId: string; raw: string }[] = []

  const cleaned = evidence.map((item) => {
    const kept = item.metrics.filter((metric) => {
      const ok = isGrounded(metric, sourceValues)
      if (!ok) dropped.push({ evidenceId: item.id, raw: metric.raw })
      return ok
    })
    return kept.length === item.metrics.length ? item : { ...item, metrics: kept }
  })

  return { evidence: cleaned, dropped }
}
