import { describe, expect, it } from 'vitest'
import { buildPrepContext } from '@/lib/prep/context'
import { keepsPrepSubstance } from '@/lib/prep/pipeline'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { funnel, input } from './fixtures'
import { rawPrep } from './raw'

const ctx = buildPrepContext(input({ evidence: [funnel] }), Date.parse('2026-10-18T09:00:00Z'))
const prep = (mut: (r: ReturnType<typeof rawPrep>) => void = () => {}) => {
  const raw = rawPrep()
  mut(raw)
  return sanitizePrep(raw, ctx)
}
const none = new Set<string>()

describe('keepsPrepSubstance', () => {
  it('keeps a rewrite that only reworded', () => {
    const after = prep((r) => {
      const s = r.stories[0]
      if (s) s.action.text = 'I set up the conversion funnel to run itself.'
    })
    expect(keepsPrepSubstance(prep(), after, none)).toBe(true)
  })

  it('refuses a rewrite that emptied a CV fact, a gap bridge or a short line nobody doubted', () => {
    const before = prep()
    const noFacts = prep((r) => {
      const d = r.cvDefense[0]
      if (d) d.facts.text = ''
    })
    const noBridge = prep((r) => {
      const g = r.gapAnswers[0]
      if (g) g.bridge.text = ''
    })
    const fewerShort = prep((r) => {
      const s = r.stories[0]
      if (s) s.short = s.short.slice(0, 1)
    })
    expect(keepsPrepSubstance(before, noFacts, none)).toBe(false)
    expect(keepsPrepSubstance(before, noBridge, none)).toBe(false)
    expect(keepsPrepSubstance(before, fewerShort, none)).toBe(false)
  })

  it('lets a rewrite drop exactly the lines the check doubted', () => {
    const before = prep()
    const noFacts = prep((r) => {
      const d = r.cvDefense[0]
      if (d) d.facts.text = ''
    })
    const noBridge = prep((r) => {
      const g = r.gapAnswers[0]
      if (g) g.bridge.text = ''
    })
    const noSecondShort = prep((r) => {
      const s = r.stories[0]
      if (s) s.short = [s.short[0] ?? '', s.short[2] ?? '']
    })
    expect(keepsPrepSubstance(before, noFacts, new Set(['cvDefense.b1']))).toBe(true)
    expect(keepsPrepSubstance(before, noBridge, new Set(['gapAnswers.g1.bridge']))).toBe(true)
    expect(keepsPrepSubstance(before, noSecondShort, new Set(['stories.s1.short.1']))).toBe(true)
  })
})
