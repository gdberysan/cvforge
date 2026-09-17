import { createHash } from 'node:crypto'

/** Caches requirement extraction, so re-analysing the same posting is free. */
export function hashPosting(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex')
}

/**
 * Fingerprints the evidence projection an analysis was mapped against. The
 * projection is built deterministically (sorted, byte-stable — that is what
 * makes it prompt-cacheable), so JSON over it is stable too. A stored hash
 * that no longer matches means the evidence base changed and the verdict is
 * stale: re-map instead of serving the frozen one.
 */
export function hashEvidenceProjection(projection: unknown): string {
  return createHash('sha256').update(JSON.stringify(projection)).digest('hex')
}
