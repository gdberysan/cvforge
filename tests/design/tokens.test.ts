// tests/design/tokens.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { themeTokens } from './contrast'

const REQUIRED = [
  '--font-serif',
  '--type-verdict',
  '--type-narrative',
  '--type-hero-number',
  '--type-label',
  '--radius-control',
  '--radius-card',
  '--radius-sheet',
  '--radius-pill',
  '--shadow-1',
  '--shadow-2',
  '--shadow-3',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
  '--ease-out',
  '--tone-strong',
  '--tone-partial',
  '--tone-missing',
  '--tone-unjudged',
]

describe('tokens v2', () => {
  it('the palette defines every token', () => {
    const tk = themeTokens()
    expect(REQUIRED.filter((k) => !(k in tk))).toEqual([])
  })
  it('there is one theme: nothing switches on the system or an attribute', () => {
    for (const f of ['app/globals.css', 'styles/korven/colors.css'])
      expect(readFileSync(f, 'utf8')).not.toMatch(/prefers-color-scheme|data-theme/)
  })
  it('reduced motion zeroes every duration', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{[^}]*--dur-fast:\s*0ms/,
    )
  })
  it('no type role uses Space Grotesk or Inter', () => {
    expect(readFileSync('lib/fonts.ts', 'utf8')).not.toMatch(/Space_Grotesk|Inter\b/)
  })
})
