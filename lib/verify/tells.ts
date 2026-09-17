import type { DocumentLanguage } from '@/lib/schemas'

/**
 * Phrases that mark generated prose as generated.
 *
 * This is a *style* check and is kept strictly apart from the grounding
 * report: a cliché is embarrassing, a fabricated employer is disqualifying,
 * and folding them into one list of "problems" would invite the model to
 * treat both as equally negotiable.
 *
 * The two lists are not translations of each other. Spanish AI prose has its
 * own tics — the throat-clearing connectives a translated English banlist
 * would never catch — and English tells like "leverage" have no Spanish
 * equivalent worth banning.
 *
 * The goal is not undetectability, which is not achievable. It is that no
 * human recruiter reads the first line and thinks "a model wrote this".
 */

/** Written without accents; matching strips them, so both spellings hit. */
const EN: string[] = [
  'delve',
  'leverage',
  'leveraging',
  'passionate about',
  'deeply passionate',
  'excited to',
  'thrilled to',
  'seamless',
  'seamlessly',
  'robust',
  'moreover',
  'furthermore',
  'in todays fast-paced',
  'fast-paced world',
  'testament to',
  'tapestry',
  'underscore',
  'underscores',
  'harness',
  'unlock',
  'elevate',
  'spearhead',
  'spearheaded',
  'align with your mission',
  'aligns with your mission',
  'perfect fit',
  'proven track record',
  'results-driven',
  'team player',
  'wealth of experience',
  'dive into',
  'deep dive',
  'navigate the complexities',
  'ever-evolving',
  'cutting-edge',
  'game-changer',
  'synergy',
  'holistic',
  'i am writing to express',
  'i would welcome the opportunity',
  'thank you for considering',
]

const ES: string[] = [
  'cabe mencionar',
  'cabe destacar',
  'cabe senalar',
  'es importante destacar',
  'es importante mencionar',
  'es importante senalar',
  'vale la pena mencionar',
  'asimismo',
  'ademas de lo anterior',
  'en resumen',
  'en conclusion',
  'me apasiona',
  'apasionado por',
  'apasionada por',
  'profundo conocimiento',
  'amplio conocimiento',
  'amplia experiencia',
  'solida experiencia',
  'en el mundo actual',
  'en la actualidad',
  'hoy en dia',
  'de la mano de',
  'un sinfin de',
  'sin fisuras',
  'robusto',
  'robusta',
  'sinergia',
  'holistico',
  'holistica',
  'valor agregado',
  'me entusiasma',
  'me emociona',
  'encaje perfecto',
  'trayectoria comprobada',
  'orientado a resultados',
  'orientada a resultados',
  'trabajo en equipo por naturaleza',
  'quedo atento a sus comentarios',
  'quedo atenta a sus comentarios',
  'no dude en contactarme',
  'agradezco su tiempo y consideracion',
  'me dirijo a usted para expresar',
]

/**
 * Split constructions, where the two halves are separated by words the
 * regex has to step over. Kept apart from the plain phrase lists because
 * they need a gap pattern rather than a literal match.
 */
const SPLIT: { language: DocumentLanguage; label: string; pattern: RegExp }[] = [
  {
    language: 'en',
    label: 'not only … but also',
    pattern: /\bnot only\b[^.!?]{0,80}\bbut also\b/i,
  },
  {
    language: 'es-MX',
    label: 'no solo … sino tambien',
    pattern: /\bno solo\b[^.!?]{0,80}\bsino (?:tambien|que tambien)\b/i,
  },
  {
    language: 'en',
    label: "it's not just … it's",
    pattern: /\bit'?s not just\b[^.!?]{0,80}\bit'?s\b/i,
  },
]

/**
 * The em dash. Its own entry because it is punctuation rather than a phrase,
 * and because it is the single loudest tell in both languages — rare on a
 * Mexican keyboard, ubiquitous in generated text.
 */
const EM_DASH = '—'

/** Accent-stripped and lowercased, so "Asimismo" and "asímismo" both match. */
function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Escapes a literal for use inside a RegExp. */
function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every distinct tell in `text`, in list order, each reported once.
 *
 * `exempt` holds terms that are real facts about this person — company names,
 * skills, the entity index the grounding checks already build. A banned word
 * that is also the name of somewhere they worked is not a tell, and telling
 * the model to rewrite it away would be worse than leaving it: "Seamless" is
 * an actual employer.
 */
export function findTells(
  text: string,
  language: DocumentLanguage,
  exempt: Set<string> = new Set(),
): string[] {
  const haystack = fold(text)
  const found: string[] = []

  if (text.includes(EM_DASH)) found.push(EM_DASH)

  for (const phrase of language === 'es-MX' ? ES : EN) {
    // Whole-word boundaries at both ends: "rebuilt" must not match "built",
    // and "undelverable" must not match "delve".
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeLiteral(phrase)}(?![\\p{L}\\p{N}])`, 'u')
    if (!pattern.test(haystack)) continue
    if (isExempt(phrase, haystack, exempt)) continue
    found.push(phrase)
  }

  for (const split of SPLIT) {
    if (split.language !== language) continue
    if (split.pattern.test(haystack)) found.push(split.label)
  }

  return found
}

/**
 * True when every occurrence of the phrase sits inside a term the person
 * actually has on file. One occurrence outside those still counts as a tell.
 */
function isExempt(phrase: string, haystack: string, exempt: Set<string>): boolean {
  if (exempt.size === 0) return false
  const covering = [...exempt]
    .map(fold)
    .filter((entity) => entity.includes(phrase) && haystack.includes(entity))
  if (covering.length === 0) return false

  // Blank out each exempt term, then ask whether the phrase survives.
  let remaining = haystack
  for (const entity of covering) {
    remaining = remaining.split(entity).join(' ')
  }
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeLiteral(phrase)}(?![\\p{L}\\p{N}])`, 'u')
  return !pattern.test(remaining)
}
