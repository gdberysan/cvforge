/**
 * A runtime list, with the union derived from it rather than the other way
 * round: the discover page turns a kind straight into a dictionary key, so a
 * test has to be able to walk every kind and prove each one has a sentence
 * behind it in both locales.
 */
export const DISCOVER_ERROR_KINDS = [
  'rate-limited',
  'blocked',
  'parse-drift',
  'not-found',
  'network',
  'unexpected',
] as const

export type DiscoverErrorKind = (typeof DISCOVER_ERROR_KINDS)[number]

/**
 * Talking to LinkedIn fails in expected ways — markup drift included — so
 * every kind maps to a translated message (discover.error.*), the way
 * AiError does for the API (lib/ai/errors.ts).
 */
export class DiscoverError extends Error {
  constructor(
    readonly kind: DiscoverErrorKind,
    detail?: string,
  ) {
    super(detail ?? kind)
    this.name = 'DiscoverError'
  }
}
