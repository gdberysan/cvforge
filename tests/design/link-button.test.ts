import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const base = readFileSync('styles/korven/base.css', 'utf8')

describe('a link styled as a button', () => {
  it('keeps its own text colour on hover: the link hover never repaints a button', () => {
    expect(base).not.toMatch(/^a:hover\s*\{/m)
    expect(base).toMatch(/a:not\(\.btn\):hover\s*\{\s*color: var\(--accent-hover\);/)
  })

  it('has no hover on a touch screen, where a tap would leave it stuck', () => {
    expect(base).toMatch(/@media \(hover: hover\) \{\s*a:not\(\.btn\):hover/)
  })
})
