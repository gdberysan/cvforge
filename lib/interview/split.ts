import type { EvidenceItem } from '@/lib/schemas'

/**
 * Splits a role's evidence into stubs and real records.
 *
 * Stubs are import-origin scaffolding — CV bullets waiting to be expanded, and
 * the only records an interview may replace. Everything else (interviewed,
 * manual) is real evidence: it provides context for planning questions but is
 * never deleted by accepting an interview.
 */
export function splitEvidenceForInterview(
  items: EvidenceItem[],
  roleId: string,
): { stubs: EvidenceItem[]; existing: EvidenceItem[] } {
  const own = items.filter((e) => e.sourceRef.type === 'experience' && e.sourceRef.id === roleId)
  return {
    stubs: own.filter((e) => e.origin === 'import'),
    existing: own.filter((e) => e.origin !== 'import'),
  }
}
