import { describe, expect, it } from 'vitest'
import { openingWords, readableReason } from '@/lib/ui/readable-reason'

describe('readableReason', () => {
  it('turns ISO month ranges into words and keeps every date', () => {
    const out = readableReason(
      'Los periodos ([2014-07–2016-02] y [2023-08–2024-12]) suman ~3.6 años',
      'es',
    )
    expect(out).toContain('jul 2014 – feb 2016')
    expect(out).toContain('ago 2023 – dic 2024')
    expect(out).toContain('unos 3,6 años')
    expect(out.endsWith('.')).toBe(true)
  })

  it('uses « » for quoted source wording and leaves apostrophes alone', () => {
    expect(readableReason('The source says "led a team" and it\'s fine.', 'en')).toBe(
      "The source says «led a team» and it's fine.",
    )
  })

  it('does not add a second full stop', () => {
    expect(readableReason('Ya termina.', 'es')).toBe('Ya termina.')
  })
})

describe('openingWords', () => {
  it('cuts at a word boundary, never inside a word', () => {
    expect(
      openingWords('Ran purchasing, marketing and logistics, the latter through an automation', 50),
    ).toBe('Ran purchasing, marketing and logistics, the…')
  })
})
