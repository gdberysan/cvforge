// tests/design/scan.test.ts
import { describe, expect, it } from 'vitest'
import { scanSource } from './scan'

describe('scanSource', () => {
  it('counts raw colour literals in tsx and css', () => {
    expect(scanSource('a.tsx', `<p style={{ color: '#fff' }} />`)['raw-colour']).toBe(1)
    expect(
      scanSource('a.css', `.x { color: rgb(1 2 3); background: hsl(0 0% 0%) }`)['raw-colour'],
    ).toBe(2)
  })
  it('counts colours in double-quoted attributes and strings', () => {
    expect(scanSource('a.tsx', `<path fill="#A8500F" />`)['raw-colour']).toBe(1)
    expect(scanSource('a.ts', `const c = "#fff"`)['raw-colour']).toBe(1)
  })
  it('ignores in-page anchors even when they look like hex', () => {
    expect(
      scanSource('a.tsx', `<a href="#add">x</a><a href='#cafe'>y</a>`)['raw-colour'],
    ).toBeUndefined()
  })
  it('ignores hex-looking ids and anchors', () => {
    expect(scanSource('a.tsx', `<a href="#main">x</a>`)['raw-colour']).toBeUndefined()
  })
  it('counts palette variables outside token files', () => {
    expect(scanSource('a.tsx', `color: 'var(--graphite-200)'`)['palette-var']).toBe(1)
    expect(scanSource('a.css', `.x { color: var(--amber-500) }`)['palette-var']).toBe(1)
  })
  it('counts the brand palette names too', () => {
    expect(scanSource('a.css', `.x { color: var(--korven-ambar) }`)['palette-var']).toBe(1)
  })
  it('counts emoji and typed arrows in strings', () => {
    expect(scanSource('d.ts', `'x': 'go →', 'y': 'a -> b', 'z': '🎉'`)).toMatchObject({
      'typed-arrow': 2,
      emoji: 1,
    })
  })
  it('does not count => in code as a typed arrow', () => {
    expect(scanSource('a.ts', `const f = (x) => x`)['typed-arrow']).toBeUndefined()
  })
  it('counts uppercase transforms and bare :hover in css', () => {
    const css = `.a { text-transform: uppercase } .b:hover { color: red }
@media (hover: hover) { .c:hover { color: blue } }`
    expect(scanSource('a.css', css)).toMatchObject({ uppercase: 1, 'bare-hover': 1 })
  })
  it('counts inline style objects in tsx only', () => {
    expect(scanSource('a.tsx', `<p style={{ a: 1 }} /><i style={{b:2}} />`)['inline-style']).toBe(2)
    expect(scanSource('a.ts', `style={{ a: 1 }}`)['inline-style']).toBeUndefined()
  })

  it('counts native tooltips on elements, not on an iframe or a component prop', () => {
    const tsx = [
      '<span className="x" title={f.id}>a</span>',
      '<Link href="/" title="Go">b</Link>',
      '<iframe title="Preview" />',
      '<Sheet title={t("x")} />',
    ].join('\n')
    expect(scanSource('a.tsx', tsx)['native-tooltip']).toBe(2)
  })
})
