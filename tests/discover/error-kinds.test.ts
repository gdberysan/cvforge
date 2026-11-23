import { describe, expect, it } from 'vitest'
import { DISCOVER_ERROR_KINDS } from '@/lib/discover/errors'
import { dictionary } from '@/lib/i18n/dictionary'

/**
 * The discover page renders `t(\`discover.error.${kind}\`)` for whatever kind
 * it ends up with, so a kind with no dictionary entry surfaces the raw key to
 * the user in place of a sentence. Enumerating the union at runtime is the
 * only way to catch that before they do.
 */
describe('discover error kinds', () => {
  for (const kind of DISCOVER_ERROR_KINDS) {
    it(`has a real message in both locales for "${kind}"`, () => {
      const key = `discover.error.${kind}` as const
      for (const locale of ['en', 'es'] as const) {
        const text = dictionary[locale][key]
        expect(text, `${locale}:${key}`).toBeTruthy()
        expect(text).not.toBe(key)
        expect(text.length).toBeGreaterThan(10)
      }
    })
  }

  it('keeps a kind for failures that are not LinkedIn at all', () => {
    // Anything the page catches that is not a DiscoverError used to be
    // relabelled 'network', which told the user to check a connection that
    // was never the problem.
    expect(DISCOVER_ERROR_KINDS).toContain('unexpected')
  })
})
