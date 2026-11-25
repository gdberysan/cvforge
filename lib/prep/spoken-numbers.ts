/**
 * Speech as the figure readers expect it. Dictation may write "eight
 * times", "ciento cincuenta mil pesos" or "tres punto cuatro veces" where
 * the prepared answer says 8x, 150,000 MXN and 3.4x: rehearsal would call
 * a figure he said "left out". Number words become digits, "times/veces"
 * becomes "x", "pesos/dollars" become their codes. Only rehearsal reads
 * this; the truth checks never accept spelled-out figures from the model.
 */

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Lang = 'es' | 'en'
const UNITS: Record<Lang, Record<string, number>> = {
  en: {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  },
  es: {
    cero: 0,
    un: 1,
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    diecisiete: 17,
    dieciocho: 18,
    diecinueve: 19,
    veinte: 20,
    veintiuno: 21,
    veintiun: 21,
    veintiuna: 21,
    veintidos: 22,
    veintitres: 23,
    veinticuatro: 24,
    veinticinco: 25,
    veintiseis: 26,
    veintisiete: 27,
    veintiocho: 28,
    veintinueve: 29,
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    sesenta: 60,
    setenta: 70,
    ochenta: 80,
    noventa: 90,
    cien: 100,
    ciento: 100,
    doscientos: 200,
    doscientas: 200,
    trescientos: 300,
    trescientas: 300,
    cuatrocientos: 400,
    cuatrocientas: 400,
    quinientos: 500,
    quinientas: 500,
    seiscientos: 600,
    seiscientas: 600,
    setecientos: 700,
    setecientas: 700,
    ochocientos: 800,
    ochocientas: 800,
    novecientos: 900,
    novecientas: 900,
  },
}
const HUNDRED: Record<Lang, Set<string>> = { en: new Set(['hundred']), es: new Set() }
const BIG: Record<Lang, Record<string, number>> = {
  en: { thousand: 1e3, million: 1e6, billion: 1e9 },
  es: { mil: 1e3, millon: 1e6, millones: 1e6 },
}
const JOIN: Record<Lang, Set<string>> = { en: new Set(['and']), es: new Set(['y']) }
const POINT: Record<Lang, Set<string>> = { en: new Set(['point']), es: new Set(['punto', 'coma']) }

const isNumberWord = (w: string, l: Lang) => w in UNITS[l] || HUNDRED[l].has(w) || w in BIG[l]

/** One run of number words ("ciento cincuenta mil") as its value. */
function runValue(words: string[], l: Lang): number | null {
  let total = 0
  let current = 0
  let fraction = ''
  let inFraction = false
  let any = false
  for (const w of words) {
    if (POINT[l].has(w)) {
      inFraction = true
      continue
    }
    if (JOIN[l].has(w)) continue
    if (inFraction) {
      const d = UNITS[l][w]
      if (d === undefined || d > 9) return null
      fraction += String(d)
      continue
    }
    if (w in UNITS[l]) {
      current += UNITS[l][w] ?? 0
      any = true
    } else if (HUNDRED[l].has(w)) {
      current = (current || 1) * 100
      any = true
    } else if (w in BIG[l]) {
      total += (current || 1) * (BIG[l][w] ?? 1)
      current = 0
      any = true
    }
  }
  if (!any) return null
  const whole = total + current
  return fraction ? Number(`${whole}.${fraction}`) : whole
}

/** The transcript with spoken figures written as the readers expect. */
export function digitsFromSpeech(text: string, l: Lang): string {
  // "por ciento" is a percent sign, not a hundred.
  const prepared = l === 'es' ? text.replace(/(\S)\s+por\s+ciento\b/giu, '$1%') : text
  // Tokens keep their original spelling for everything that isn't a number.
  const tokens = prepared.split(/(\s+|-)/u)
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const raw = tokens[i] ?? ''
    const word = fold(raw).replace(/[^a-z]/g, '')
    if (!isNumberWord(word, l)) {
      out.push(raw)
      i++
      continue
    }
    // Gather the run: number words, joiners and a decimal point between them.
    const run: string[] = []
    let j = i
    let lastNumber = i
    while (j < tokens.length) {
      const t = tokens[j] ?? ''
      if (/^(\s+|-)$/u.test(t)) {
        j++
        continue
      }
      const w = fold(t).replace(/[^a-z]/g, '')
      if (isNumberWord(w, l) || ((JOIN[l].has(w) || POINT[l].has(w)) && run.length > 0)) {
        run.push(w)
        if (isNumberWord(w, l)) lastNumber = j
        j++
        // Punctuation after a word ends the run ("ocho, y luego").
        if (/[,.;:!?%]$/u.test(t) && !POINT[l].has(w)) break
        continue
      }
      break
    }
    // A trailing joiner or point belongs to the sentence, not the number.
    while (run.length > 0 && !isNumberWord(run[run.length - 1] ?? '', l)) run.pop()
    // "150 mil": a magnitude after digits is already a figure the readers know.
    const prev = out.join('').trimEnd()
    if (run.every((w) => w in BIG[l]) && /\d$/u.test(prev)) {
      out.push(raw)
      i++
      continue
    }
    const value = runValue(run, l)
    if (value === null) {
      out.push(raw)
      i++
      continue
    }
    const trailing = (tokens[lastNumber] ?? '').match(/[,.;:!?%]+$/u)?.[0] ?? ''
    out.push(String(value) + trailing)
    i = lastNumber + 1
  }
  return out
    .join('')
    .replace(/(\d)\s*(?:times|veces)\b/giu, '$1x')
    .replace(
      /(\d(?:\s+(?:mil|millones|millón|thousand|million))?)\s*pesos(?:\s+mexicanos)?\b/giu,
      '$1 MXN',
    )
    .replace(
      /(\d(?:\s+(?:mil|millones|millón|thousand|million))?)\s*(?:dollars|dolares|dólares)\b/giu,
      '$1 USD',
    )
}
