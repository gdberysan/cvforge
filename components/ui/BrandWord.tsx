import { BRAND } from '@/lib/brand'

/** The product's name as the landing sets it: heavy, tight; "rumbo" in lowercase. */
export function BrandWord() {
  return <span className={BRAND === 'Rumbo' ? 'brand-word is-lower' : 'brand-word'}>{BRAND}</span>
}
