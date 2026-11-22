import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('app/globals.css', 'utf8')
const block = (sel: string) => {
  const i = css.lastIndexOf(`${sel} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

describe('top bar', () => {
  it('its links scroll inside the bar instead of widening the page', () => {
    const links = block('.topnav-links')
    expect(links).toMatch(/overflow-x:\s*auto/)
    expect(links).toMatch(/position:\s*relative/)
  })
  it('on a phone it scrolls away with the page: only the bottom bar stays', () => {
    expect(css).toMatch(/@media \(max-width: 699px\) \{\s*\.topnav \{ position: static; \}/)
  })
})
