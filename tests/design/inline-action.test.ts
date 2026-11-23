import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('app/globals.css', 'utf8')

describe('inline prose actions', () => {
  it('keep their inline height after the 44px phone rule', () => {
    const touch = css.indexOf('@media (max-width: 699px), (pointer: coarse)')
    const inline = css.indexOf('.action-inline', touch)
    expect(touch).toBeGreaterThan(-1)
    expect(inline).toBeGreaterThan(touch)
    const block = css.slice(inline, css.indexOf('}', inline))
    expect(block).toMatch(/display:\s*inline;/)
    expect(block).toMatch(/min-height:\s*0/)
  })
  it('hide the bottom bar on the phone while a record field has focus', () => {
    expect(css).toMatch(/body:has\(\.rec-edit :is\(input, textarea, select\):focus\) \.bottomnav/)
  })
})
