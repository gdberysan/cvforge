import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * Synchronous sha256 that runs in Node and in a browser Worker alike — the
 * web edition has no node:crypto, and WebCrypto's digest is async while every
 * caller here is sync. Byte-identical to node:crypto (tested), so hashes
 * stored by either edition match.
 */
const hex = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)))

/** Caches requirement extraction, so re-analysing the same posting is free. */
export function hashPosting(text: string): string {
  return hex(text.trim())
}

/**
 * Fingerprints the evidence projection an analysis was mapped against. The
 * projection is built deterministically (sorted, byte-stable — that is what
 * makes it prompt-cacheable), so JSON over it is stable too. A stored hash
 * that no longer matches means the evidence base changed and the verdict is
 * stale: re-map instead of serving the frozen one.
 */
export function hashEvidenceProjection(projection: unknown): string {
  return hex(JSON.stringify(projection))
}
