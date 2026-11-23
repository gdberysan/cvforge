import { describe, expect, it } from 'vitest'
import { postingFromTranscript } from '@/lib/ai/stages/transcribe-posting'
import { tileRows } from '@/web/lib/screenshots'

describe('tiling a tall screenshot', () => {
  it('leaves an ordinary phone screenshot whole', () => {
    expect(tileRows(1080, 2340)).toEqual([[0, 2340]])
  })

  it('cuts a scroll capture into overlapping tiles that cover it all, in order', () => {
    const rows = tileRows(1080, 9000)
    expect(rows.length).toBeGreaterThan(3)
    expect(rows[0]?.[0]).toBe(0)
    for (let i = 1; i < rows.length; i++) {
      const [prevTop, prevH] = rows[i - 1] as [number, number]
      const [top] = rows[i] as [number, number]
      expect(top).toBeGreaterThan(prevTop)
      expect(top).toBeLessThan(prevTop + prevH) // overlaps the previous tile
    }
    const [lastTop, lastH] = rows.at(-1) as [number, number]
    expect(lastTop + lastH).toBe(9000)
    for (const [, h] of rows) expect(h).toBeLessThanOrEqual(1080 * 2)
  })
})

describe('the posting text from a transcript', () => {
  it('puts the header facts first and leaves out what was not visible', () => {
    expect(
      postingFromTranscript({
        title: 'Growth Lead',
        company: 'Acme',
        location: '',
        text: 'About the role\n- Own paid media',
        unreadable: '',
      }),
    ).toBe('Growth Lead\nAcme\n\nAbout the role\n- Own paid media')
  })
})
