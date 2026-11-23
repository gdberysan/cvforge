import { CURRENCY_CODES } from '@/lib/schemas/metric'

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
const CODES = CURRENCY_CODES.join('|')

const PATTERNS: RegExp[] = [
  // "40%", "40 percent", "40 por ciento", and a range "15-20%".
  new RegExp(`${NUM}(?:\\s?[-–]\\s?${NUM})?\\s?(?:%|percent|por ciento)(?![\\p{L}])`, 'giu'),
  new RegExp(`[$€£]\\s?${NUM}\\s?(?:${MAG})?`, 'giu'),
  new RegExp(`${NUM}\\s?(?:${MAG})?\\s?(?:${CODES})(?![\\p{L}])`, 'giu'),
  new RegExp(`(?<![\\p{L}])(?:${CODES})\\s?${NUM}\\s?(?:${MAG})?`, 'giu'),
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

/** Spelled-out small numbers a record may hold where a line prints digits. */
const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  one: 1,
  dos: 2,
  two: 2,
  tres: 3,
  three: 3,
  cuatro: 4,
  four: 4,
  cinco: 5,
  five: 5,
  seis: 6,
  six: 6,
  siete: 7,
  seven: 7,
  ocho: 8,
  eight: 8,
  nueve: 9,
  nine: 9,
  diez: 10,
  ten: 10,
  // Not "once": eleven in Spanish, but the English adverb ("Once the launch
  // closed…") would ground any 11 a line invents.
  eleven: 11,
  doce: 12,
  twelve: 12,
  docena: 12,
  dozen: 12,
  quince: 15,
  fifteen: 15,
  veinte: 20,
  twenty: 20,
  cien: 100,
  hundred: 100,
}

// Not counts: a date or year-month, "24/7", and anything glued to a letter
// or an underscore ("GA4", "B2B", "Q3", "cert_3") — those name things rather
// than claim a size.
const NOT_A_COUNT =
  /\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\/\d{4}\b|\b24\/7\b/g
// A count and the magnitude word after it, which belongs to the number:
// "12 mil" is twelve thousand, never twelve. Words may stand apart; the
// short forms only glued ("12k", "3M"), so "5 m de altura" stays five.
const MAGNITUDE =
  '(?:\\s?(mil\\s+millones|millones|millón|millon|millions?|billions?|mil|k)|(mm|mn|bn|m|b))(?![\\p{L}\\p{N}_])'
const COUNT = new RegExp(
  `(?<![\\p{L}\\p{N}.,_])(\\d[\\d,.]*)(?:${MAGNITUDE})?(?![\\p{L}\\p{N}_])`,
  'giu',
)
// A source states the digit of a name too: evidence saying "GA4" grounds a
// line printing "Google Analytics 4". Only record ids ("cert_3",
// "ev_2c46f5cb") are taken out first — those state nothing.
const SOURCE_NUMBER = new RegExp(`(?<![\\p{N}.,])(\\d[\\d,.]*)(?:${MAGNITUDE})?`, 'giu')
const RECORD_ID = /(?<![\p{L}\p{N}])\p{L}+_[\p{L}\p{N}-]+/gu
const COUNT_SCALE: Record<string, number> = {
  millones: 1e6,
  millón: 1e6,
  millon: 1e6,
  million: 1e6,
  millions: 1e6,
  billion: 1e9,
  billions: 1e9,
  mil: 1e3,
  k: 1e3,
  mm: 1e6,
  mn: 1e6,
  m: 1e6,
  bn: 1e9,
  b: 1e9,
}

/**
 * The counts in a text, each read with its magnitude word. A single dot
 * group ("1.200") is es-MX thousands here: a count is whole, so 1.2 campaigns
 * is never the reading.
 */
function readCounts(text: string, pattern: RegExp = COUNT): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = []
  for (const match of text.replace(NOT_A_COUNT, ' ').matchAll(pattern)) {
    const raw = (match[1] ?? '').replace(/[,.]+$/, '')
    const word = (match[2] ?? match[3] ?? '').toLowerCase().replace(/\s+/g, ' ')
    const scale = word === 'mil millones' ? 1e9 : word ? (COUNT_SCALE[word] ?? 1) : 1
    const base = /^\d{1,3}\.\d{3}$/.test(raw) ? Number(raw.replace('.', '')) : readNumber(raw)
    const value = Number((base * scale).toPrecision(12))
    if (Number.isFinite(value)) out.push({ raw, value })
  }
  return out
}
const YEAR_SPAN = /(?<![\p{L}\p{N}.,])(\d{1,2})\s?\+?\s?(?:años|anos|years|yrs)(?![\p{L}])/giu

/**
 * The bare counts in a line — "a team of 6", "+200 clientes", "12 campaigns" —
 * read to numbers. Percentages, money and multipliers are left to
 * extractQuantities, and four-digit years are not claims. Every count a CV
 * line prints must exist in what it cites (see numbersIn), compared as a
 * value: "1,200" and "1200" are one count, "1.2" and "12" are not.
 */
export function extractCounts(text: string): number[] {
  // A span of time is judged by extractYearSpans, against the dates on record.
  let rest = text.replace(YEAR_SPAN, ' ')
  for (const quantity of extractQuantities(rest)) rest = rest.split(quantity).join(' ')
  const counts: number[] = []
  for (const { raw, value } of readCounts(rest)) {
    if (/^(?:19|20)\d{2}$/.test(raw)) continue
    if (!counts.includes(value)) counts.push(value)
  }
  return counts
}

/**
 * Every number a source states, digits or a spelled-out small number, read
 * the way extractCounts reads a line — so the two sides compare one value.
 */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>()
  for (const { value } of readCounts(text.replace(RECORD_ID, ' '), SOURCE_NUMBER)) found.add(value)
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  for (const word of folded.split(/[^a-z]+/)) {
    const value = NUMBER_WORDS[word]
    if (value !== undefined) found.add(value)
  }
  return found
}

/**
 * "8 años de experiencia", "5+ years": a span of time, judged against the
 * time on record rather than a stated figure. Returns the claimed years.
 */
export function extractYearSpans(text: string): number[] {
  return [...text.matchAll(YEAR_SPAN)].map((m) => Number(m[1]))
}
