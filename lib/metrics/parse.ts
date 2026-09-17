import type { Currency } from '@/lib/schemas'

export type ParsedMetric = {
  value?: number
  unit?: string
  currency?: Currency
  direction?: 'up' | 'down'
  /**
   * A money figure was found but its currency is genuinely ambiguous — "$1.2M"
   * differs between MXN and USD by roughly 17x. The UI asks rather than
   * guessing, because a wrong currency is a fabricated claim.
   */
  needsCurrency: boolean
}

const DOWN =
  /\b(cut|reduc\w*|decreas\w*|fell|drop\w*|lower\w*|sav\w*|eliminat\w*|remov\w*|shrank)\b/i
const UP =
  /\b(grew|grow\w*|increas\w*|rais\w*|improv\w*|doubl\w*|tripl\w*|boost\w*|driv\w*|drove|scal\w*)\b/i

const MAGNITUDE: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  millones: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
}

const CURRENCY_CODES = new Set(['MXN', 'USD', 'EUR'])

/** Number, optional magnitude suffix, then whatever unit token follows. */
// The word boundary sits INSIDE the optional magnitude group on purpose: a
// trailing \b would fail on "3x", where no boundary exists between digit and
// letter, while keeping it here still stops "5men" reading as five million.
// The lookbehind rejects digits glued to an identifier — in "p95 latency 40%"
// the metric is 40, not 95.
const NUMBER =
  /(?<![\p{L}\d])(?<sym>[$€£])?\s*(?<num>\d[\d,]*(?:\.\d+)?)\s*(?:(?<mag>k|mm|mn|m|bn|b|million|millones|billion)\b)?/iu

/**
 * Turns what someone actually types — "cut checkout abandonment 18%" — into a
 * structured metric. Parsing is what lets the editor be one field instead of
 * four, which matters because an editor that is tedious stops getting used,
 * and unquantified evidence can never carry a result in a generated CV.
 */
export function parseMetric(raw: string): ParsedMetric {
  const text = raw.trim()
  if (!text) return { needsCurrency: false }

  // Skip bare years so "the 2018 replatform" is not read as a quantity — but
  // a year-sized number followed by a unit is a quantity: "saved 2000 hours
  // per year" quantifies real work and must not vanish.
  const scan = text.replace(
    /(?<![.\d])(?:19|20)\d{2}(?![\d.%])/g,
    (year: string, offset: number) =>
      startsWithUnitSignal(text.slice(offset + year.length)) ||
      // "$2000" and "2000 MXN" are money, not a date — the symbol before or
      // the code after says so even without a rate unit.
      /[$€£]\s*$/.test(text.slice(0, offset))
        ? year
        : ' ',
  )

  const match = NUMBER.exec(scan)
  if (!match?.groups) return { needsCurrency: false }

  const { sym, num, mag } = match.groups
  const base = Number(readDecimal(num))
  if (!Number.isFinite(base)) return { needsCurrency: false }

  const value = mag ? base * (MAGNITUDE[mag.toLowerCase()] ?? 1) : base
  const after = scan.slice(match.index + match[0].length)

  const result: ParsedMetric = { value, needsCurrency: false }

  if (DOWN.test(text)) result.direction = 'down'
  else if (UP.test(text)) result.direction = 'up'

  // An explicit ISO code wins over a bare symbol, but only when it is attached
  // to THIS number — "cut costs 30% saving $5,000 MXN" must not stamp MXN
  // onto the 30.
  const before = scan.slice(0, match.index)
  const code = (after.match(/^\s*(mxn|usd|eur)\b/i) ??
    before.match(/\b(mxn|usd|eur)\s*$/i))?.[1]?.toUpperCase()
  if (code && CURRENCY_CODES.has(code)) {
    result.unit = code
    result.currency = code as Currency
    return result
  }

  if (sym) {
    result.needsCurrency = true
    return result
  }

  const unit = readUnit(after)
  if (unit) result.unit = unit
  return result
}

/**
 * "1,5" is one and a half in es-MX, not fifteen: a single comma followed by
 * one or two digits is a decimal comma; comma-grouped thousands always come
 * in threes. The es-MX UI makes decimal commas the expected input — reading
 * them as separators inflated stored metrics 10–100x, and a wrong number
 * stored as ground truth is a fabricated claim with a paper trail.
 */
export function readDecimal(num: string): string {
  if (/^\d+,\d{1,2}$/.test(num)) return num.replace(',', '.')
  return num.replace(/,/g, '')
}

/**
 * True when the text right after a number reads as a unit — "%", "x", a
 * magnitude word, or a rate like "hours per year". This is what separates a
 * quantity that happens to be year-sized from an actual date.
 */
function startsWithUnitSignal(after: string): boolean {
  if (/^\s*(%|x\b)/i.test(after)) return true
  if (/^\s*(k|mm|mn|m|bn|b|million|millones|billion)\b/i.test(after)) return true
  if (/^\s*(mxn|usd|eur)\b/i.test(after)) return true
  return /^\s*[a-záéíóúñ]+\s+(?:per|a|por)\s+[a-záéíóúñ]+/i.test(after)
}

function readUnit(after: string): string | undefined {
  const immediate = after.match(/^\s*(%|x\b)/i)
  if (immediate) return immediate[1].toLowerCase()

  // "12 hours per week" -> hours/week; the optional Spanish article means
  // "12 horas a la semana" reads horas/semana, not horas/la.
  const rate = after.match(
    /^\s*([a-záéíóúñ]+)\s+(?:per|a|por)\s+(?:(?:la|el|los|las|un|una)\s+)?([a-záéíóúñ]+)/i,
  )
  if (rate) return `${rate[1].toLowerCase()}/${rate[2].toLowerCase()}`

  const word = after.match(/^\s*([a-záéíóúñ]+)/i)
  return word ? word[1].toLowerCase() : undefined
}
