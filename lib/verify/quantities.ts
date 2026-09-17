/**
 * Extracts the numeric claims worth verifying against recorded metrics.
 *
 * Deliberately narrow. Percentages, money, and multipliers are the numbers a
 * recruiter will challenge and a candidate must defend. Bare counts ("a team
 * of 6") and years ("the 2018 replatform") produce false positives that would
 * drown the report, so they are excluded.
 */

// Longest alternative first and no letter after: "mil" must not tokenise as
// "m" (a thousand read as a million let a 1000x inflation pass), and "5 men"
// is not five million.
const MAG = '(?:millones|millón|million|billion|mil|mm|mn|bn|k|m|b)(?![\\p{L}])'
const NUM = '\\d[\\d,.]*'

const PATTERNS: RegExp[] = [
  // "40%", "40 percent", "40 por ciento", and a range "15-20%".
  new RegExp(`${NUM}(?:\\s?[-–]\\s?${NUM})?\\s?(?:%|percent|por ciento)(?![\\p{L}])`, 'giu'),
  new RegExp(`[$€£]\\s?${NUM}\\s?(?:${MAG})?`, 'giu'),
  new RegExp(`${NUM}\\s?(?:${MAG})?\\s?(?:MXN|USD|EUR)(?![\\p{L}])`, 'giu'),
  new RegExp(`(?:MXN|USD|EUR)\\s?${NUM}\\s?(?:${MAG})?`, 'giu'),
  // "3x", "3.4x", "3,4x", "3×".
  /\d+(?:[.,]\d+)?\s?(?:x|×)(?![\p{L}])/giu,
]

export function extractQuantities(text: string): string[] {
  const found: { value: string; index: number }[] = []

  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim()
      if (/^\d{4}$/.test(value)) continue // a bare year
      const index = match.index ?? 0

      // A range asserts both bounds; an invented lower bound must not hide
      // behind a recorded upper one.
      const range = value.match(/^(\d[\d,.]*)\s?[-–]\s?(\d[\d,.]*)(\s?(?:%|percent|por ciento))$/iu)
      if (range) {
        found.push({ value: `${range[1]}${range[3]}`, index })
        found.push({ value: `${range[2]}${range[3]}`, index: index + 1 })
        continue
      }
      found.push({ value, index })
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((f) => f.value)
    .filter((v, i, all) => all.indexOf(v) === i)
}

const SCALE: Record<string, number> = {
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
 * Comparison form: the quantity as a plain number followed by its unit, so
 * "$1.2M", "1.2 M", "1.2 million", "1,200,000" and "1200000" all compare
 * equal — and the es-MX decimal comma of "1,5M" reads as 1.5, never 15.
 * Currency symbols are dropped (a symbol names no currency); ISO codes,
 * "%" and "x" are kept, because $80k and 80% are different claims.
 */
export function normaliseQuantity(value: string): string {
  const lower = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s?(?:percent|por ciento)(?![a-z])/g, '%')
    .replace(/×/g, 'x')

  // The no-letter lookahead belongs to the magnitude word only: "1200000MXN"
  // must read as the whole number followed by a code, not "120000" + "0mxn".
  const m = lower.match(/(\d[\d,.]*)\s?(?:(millones|million|billion|mil|mm|mn|bn|k|m|b)(?![a-z]))?/)
  if (!m || m.index === undefined) return lower.replace(/[\s,$€£]/g, '')

  const unit = `${lower.slice(0, m.index)} ${lower.slice(m.index + m[0].length)}`.replace(
    /[^a-z%]/g,
    '',
  )
  const scale = m[2] ? (SCALE[m[2]] ?? 1) : 1
  const number = readNumber(m[1]) * scale
  const rendered = Number.isFinite(number) ? String(number) : m[1]
  return `${rendered}${unit}`
}

/**
 * "1,5" is one and a half in es-MX, not fifteen — a single comma with one or
 * two digits after it is a decimal comma; grouped thousands come in threes.
 */
function readNumber(num: string): number {
  const trimmed = num.replace(/[,.]+$/, '')
  if (/^\d+,\d{1,2}$/.test(trimmed)) return Number(trimmed.replace(',', '.'))
  if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(trimmed)) return Number(trimmed.replace(/\./g, ''))
  return Number(trimmed.replace(/,/g, ''))
}
