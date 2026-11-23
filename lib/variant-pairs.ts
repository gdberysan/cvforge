import type { CVVariant } from '@/lib/db/queries/cv-variants'
import type { DocumentLanguage } from '@/lib/schemas'

/** One base CV in up to two languages. Either side may be missing, never both. */
export type VariantPair = { key: string } & Partial<Record<DocumentLanguage, CVVariant>>

/** The language a translation of `language` is written in. */
export function otherLanguage(language: DocumentLanguage): DocumentLanguage {
  return language === 'en' ? 'es-MX' : 'en'
}

/**
 * Rows with the same name and market and different languages are one CV in
 * two languages — no column says so, the pairing is by name + market. A row
 * whose language is already taken in its pair (two Spanish "E-commerce")
 * starts a pair of its own rather than hiding the other. Pure: the page
 * groups on the client from the rows it already has.
 */
export function pairVariants(variants: CVVariant[]): VariantPair[] {
  const pairs: VariantPair[] = []
  for (const v of variants) {
    const open = pairs.find((p) => p.key === pairKey(v) && !p[v.language])
    if (open) open[v.language] = v
    else pairs.push({ key: pairKey(v), [v.language]: v })
  }
  return pairs
}

function pairKey(v: Pick<CVVariant, 'name' | 'market'>): string {
  return `${v.market}\u0000${v.name}`
}
