// tests/design/contrast.test.ts
import { describe, expect, it } from 'vitest'
import { ratio, themeTokens } from './contrast'

describe('ratio', () => {
  it('matches WCAG reference values', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(ratio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })
})

const TEXT = ['--text-strong', '--text-body', '--text-muted', '--text-faint']
const SURFACES = ['--surface-base', '--surface-card', '--surface-raised']
const TONES = ['--accent', '--tone-strong', '--tone-partial', '--tone-missing', '--signal-error']

{
  describe('the palette', () => {
    const tk = themeTokens()
    for (const fg of TEXT)
      for (const bg of SURFACES)
        it(`${fg} on ${bg} ≥ 4.5`, () => expect(ratio(tk[fg], tk[bg])).toBeGreaterThanOrEqual(4.5))
    for (const fg of TONES)
      for (const bg of ['--surface-base', '--surface-card'])
        it(`${fg} on ${bg} ≥ 3`, () => expect(ratio(tk[fg], tk[bg])).toBeGreaterThanOrEqual(3))
    // Strength words printed as text (the sheet sits on --surface-raised).
    for (const fg of ['--tone-strong', '--tone-partial', '--tone-missing'])
      for (const bg of SURFACES)
        it(`${fg} as text on ${bg} ≥ 4.5`, () =>
          expect(ratio(tk[fg], tk[bg])).toBeGreaterThanOrEqual(4.5))
    // The unjudged mark is a bar, not decoration: it must be seen (1.4.11).
    for (const bg of SURFACES)
      it(`--tone-unjudged on ${bg} ≥ 3`, () =>
        expect(ratio(tk['--tone-unjudged'], tk[bg])).toBeGreaterThanOrEqual(3))
    // Whole-chip tints and verdict pills: the word sits on its own tint.
    for (const tone of ['missing', 'partial', 'strong', 'ok'])
      it(`--tone-${tone}-text on --tone-${tone}-bg ≥ 4.5`, () =>
        expect(ratio(tk[`--tone-${tone}-text`], tk[`--tone-${tone}-bg`])).toBeGreaterThanOrEqual(
          4.5,
        ))
    it('--text-on-amber on --accent ≥ 4.5', () =>
      expect(ratio(tk['--text-on-amber'], tk['--accent'])).toBeGreaterThanOrEqual(4.5))
  })
}
