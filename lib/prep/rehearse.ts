import { extractQuantities, normaliseQuantity } from '@/lib/verify/quantities'
import { digitsFromSpeech } from './spoken-numbers'

/**
 * What a rehearsal tells him, read in code from what he said and the answer
 * he prepared: never a model's opinion. Time against the length the answer
 * is meant for, the figures he landed or missed, any figure he said that the
 * prepared answer does not hold (said to check, not called a lie: he may
 * know it), and filler words. Free and the same every time.
 */
export type RehearsalTarget = { min: number; max: number }

/** A pitch is about a minute; a story told whole, a minute and a half or two. */
export const TARGETS = {
  pitch: { min: 45, max: 80 },
  story: { min: 60, max: 130 },
} as const satisfies Record<string, RehearsalTarget>

export type Rehearsal = {
  seconds: number
  pace: 'short' | 'good' | 'long'
  words: number
  /** Words a minute; null without a transcript. */
  wpm: number | null
  /** Figures of the prepared answer he said. */
  landed: string[]
  /** Figures of the prepared answer he left out. */
  missed: string[]
  /** Figures he said that the prepared answer does not hold. */
  unprepared: string[]
  fillers: { word: string; count: number }[]
}

const FILLERS = {
  es: ['o sea', 'eh', 'em', 'mmm', 'digamos'],
  en: ['um', 'uh', 'you know', 'i mean', 'basically'],
}
/** Real words too ("este proyecto", "I'd like"): a filler only before a pause. */
const PAUSED = { es: ['este', 'pues', 'bueno'], en: ['like', 'so'] }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function countFillers(transcript: string, language: 'es' | 'en') {
  const text = ` ${fold(transcript).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const raw = fold(transcript)
  return [
    ...FILLERS[language].map((word) => ({ word, count: text.split(` ${word} `).length - 1 })),
    ...PAUSED[language].map((word) => ({
      word,
      count: raw.match(new RegExp(`(?<![\\p{L}])${word}\\s*[,.…]`, 'gu'))?.length ?? 0,
    })),
  ]
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count)
}

/**
 * Each figure once, keyed by value and kind (a percentage, a multiple, an
 * amount), shown as first written. A currency said aloud ("pesos") or left
 * unsaid is the same amount here: this is practice, not a truth check, and
 * 1.8% still differs from 18%.
 */
function figures(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const q of extractQuantities(text)) {
    const n = normaliseQuantity(q)
    const value = n.match(/^[\d.]+/)?.[0] ?? n
    const key = `${value}${n.includes('%') ? '%' : n.endsWith('x') ? 'x' : ''}`
    // Shown the way the prepared answer would write it: "25%", not "25 percent".
    if (!out.has(key)) out.set(key, q.replace(/\s?(?:percent|por ciento)/iu, '%'))
  }
  return out
}

export function readRehearsal(input: {
  seconds: number
  transcript: string
  prepared: string
  target: RehearsalTarget
  language: 'es' | 'en'
}): Rehearsal {
  const { seconds, transcript, prepared, target, language } = input
  const words = transcript.trim() === '' ? 0 : transcript.trim().split(/\s+/u).length
  const said = figures(digitsFromSpeech(transcript, language))
  const ready = figures(prepared)
  return {
    seconds,
    pace: seconds < target.min ? 'short' : seconds > target.max ? 'long' : 'good',
    words,
    wpm: words > 0 && seconds > 0 ? Math.round((words / seconds) * 60) : null,
    landed: [...ready].filter(([k]) => said.has(k)).map(([, v]) => v),
    missed: [...ready].filter(([k]) => !said.has(k)).map(([, v]) => v),
    unprepared: [...said].filter(([k]) => !ready.has(k)).map(([, v]) => v),
    fillers: countFillers(transcript, language),
  }
}
