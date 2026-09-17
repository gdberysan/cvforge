/**
 * The answer bank's key. Workday and Greenhouse ask the same thirty questions
 * forever with cosmetic variation — casing, punctuation, accents, spacing —
 * so the key strips exactly that and nothing more.
 */
export function normalizeQuestion(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
}
