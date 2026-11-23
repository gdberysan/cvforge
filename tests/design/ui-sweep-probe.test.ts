// tests/design/ui-sweep-probe.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { probe } from '@/scripts/ui-sweep-probe'

describe('probe', () => {
  it('counts visible words', () => {
    document.body.innerHTML = '<main><p>uno dos tres</p><p hidden>cuatro</p></main>'
    expect(probe(document, window, true).words).toBe(3)
  })
})
