/**
 * The free relevance rule: does a posting's title share a meaningful word
 * with what the user is looking for (target titles plus the agent's search
 * keywords)? One implementation, two readers — the job agent's screen
 * (cvforge-satellite `src/filter.ts`, which imports it from here) and the
 * Puestos objetivo preview in Ajustes, so the preview can never show a
 * verdict the agent would not reach. Pure: no I/O, safe in a client bundle.
 */

/** Accent-folded lowercase — the posting may be in either language. */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Words that say nothing about WHAT the job is — a "Marketing Manager" and
 * an "Account Manager" share "manager" and nothing else. Dropped before the
 * relevance comparison, with every word of 3 letters or fewer.
 */
export const GENERIC = new Set([
  'manager',
  'gerente',
  'senior',
  'lead',
  'lider',
  'head',
  'specialist',
  'especialista',
  'coordinator',
  'coordinador',
  'coordinadora',
  'analyst',
  'analista',
  'director',
  'directora',
  'jefe',
  'jefa',
  'remote',
  'remoto',
  'hibrido',
  'hybrid',
  // "Sales Development", "Business Development": the prefix rule would join it
  // to "developer" and let every SDR role through an automation search.
  'development',
])

/**
 * Trade acronyms are short but are the whole title ("Especialista en PPC").
 * Dropping every word of three letters or fewer threw them away, so a PPC
 * posting matched nothing and was screened out. These count; other short
 * words (de, en, of, the, sr) still don't.
 */
export const SHORT_TERMS = new Set([
  'ppc',
  'sem',
  'seo',
  'crm',
  'cro',
  'sql',
  'kam',
  'b2b',
  'b2c',
  'd2c',
  'dsp',
  'gtm',
  'erp',
  'ai',
])

/**
 * Searches are mostly in English and postings often in Spanish. The prefix
 * rule below already joins cognates (automatización ~ automation), but not
 * words that share no root — and mercadotecnia IS marketing. Each Spanish
 * word maps to the English one it means; the list only needs the words a
 * marketing/automation search actually uses.
 */
export const ES_TO_EN: Record<string, string> = {
  mercadotecnia: 'marketing',
  mercadeo: 'marketing',
  crecimiento: 'growth',
  adquisicion: 'acquisition',
  ventas: 'sales',
  desarrollo: 'development',
  desarrollador: 'developer',
  desarrolladora: 'developer',
  operaciones: 'operations',
  ingresos: 'revenue',
  datos: 'data',
  rendimiento: 'performance',
  contenido: 'content',
  marca: 'brand',
  comercio: 'commerce',
  ia: 'ai',
}

/** The words of a title that say what the job is: folded, translated, short and generic ones dropped. */
export const meaningful = (s: string): string[] =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .map((w) => ES_TO_EN[w] ?? w)
    .filter((w) => (w.length > 3 || SHORT_TERMS.has(w)) && !GENERIC.has(w))

/** The words a title must share one of: target titles plus search keywords. */
export function relevanceWords(titles: string[]): string[] {
  return [...new Set(titles.flatMap(meaningful))]
}

// Six letters joins cognates (automatizacion/automation, operaciones →
// operations is mapped above) without joining unrelated words.
const PREFIX = 6
export const related = (a: string, b: string): boolean =>
  a === b || (a.length >= PREFIX && b.length >= PREFIX && a.slice(0, PREFIX) === b.slice(0, PREFIX))

/**
 * The verdict itself. Only when there is something to compare against: no
 * relevance words means no opinion, and a title with no word to judge by
 * gets no verdict either — silence is never a reason to drop a posting.
 */
export function isRelevantTitle(title: string, relevance: string[]): boolean {
  if (relevance.length === 0) return true
  const words = meaningful(title)
  if (words.length === 0) return true
  return words.some((w) => relevance.some((r) => related(w, r)))
}

/**
 * The relevance words the agent screens by (spec 2026-10-17 fix round 1,
 * I2): the titles the agent looks for (a satellite setting edited in Ajustes)
 * when there are any, else the profile's target titles — plus the enabled
 * searches' keywords. The agent and the Ajustes preview both call this.
 */
export function agentRelevance(input: {
  searchTitles: string[]
  profileTitles: string[]
  keywords: string[]
}): string[] {
  const titles = input.searchTitles.length > 0 ? input.searchTitles : input.profileTitles
  return relevanceWords([...titles, ...input.keywords])
}
