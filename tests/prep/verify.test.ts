import { describe, expect, it } from 'vitest'
import { buildPrepContext } from '@/lib/prep/context'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { checkPrepInCode, findPrepTells } from '@/lib/prep/verify'
import { must } from '../support/must'
import { funnel, input } from './fixtures'
import { rawPrep } from './raw'

const NOW = Date.parse('2026-10-18T09:00:00Z')
const budget = {
  ...funnel,
  id: 'ev_budget',
  text: 'Manejé un presupuesto de $12 mil',
  metrics: [{ raw: '$12 mil' }],
}
const ctx = (over = {}) => buildPrepContext(input({ evidence: [funnel, budget], ...over }), NOW)
const content = (mut: (r: ReturnType<typeof rawPrep>) => void = () => {}, c = ctx()) => {
  const raw = rawPrep()
  mut(raw)
  return sanitizePrep(raw, c)
}
const paths = (flags: { path: string; kind: string }[]) => flags.map((f) => `${f.kind}@${f.path}`)

describe('checkPrepInCode', () => {
  it('passes a prep that only says what the records hold', () => {
    expect(checkPrepInCode(content(), ctx())).toEqual([])
  })

  it('flags a beat with text and no citation', () => {
    const out = content((r) => {
      must(r.stories[0]).situation = {
        text: 'The team was in crisis.',
        citedEvidenceIds: [],
        ask: '',
        ideas: [],
      }
    })
    expect(paths(checkPrepInCode(out, ctx()))).toContain('uncited@stories.s1.situation')
  })

  it('flags 70% when the record says 45%, and accepts "45 %"', () => {
    const bad = content((r) => {
      must(r.stories[0]).result.text = 'Conversion held at 70%.'
    })
    expect(paths(checkPrepInCode(bad, ctx()))).toContain('number@stories.s1.result')
    const spaced = content((r) => {
      must(r.stories[0]).result.text = 'Conversion held at 45 %.'
    })
    expect(checkPrepInCode(spaced, ctx())).toEqual([])
  })

  it('never lets a "$12 mil" budget stand for "$12M"', () => {
    const out = content((r) => {
      must(r.stories[0]).action = {
        text: 'I ran a $12M budget.',
        citedEvidenceIds: ['ev_budget'],
        ask: '',
        ideas: [],
      }
    })
    expect(paths(checkPrepInCode(out, ctx()))).toContain('number@stories.s1.action')
  })

  it('accepts a number from his own cited answer', () => {
    const c = ctx({
      answers: [
        {
          id: 'ans_1',
          applicationId: 'app_1',
          evidenceIds: ['ev_funnel'],
          part: 'T',
          question: '¿Meta?',
          answer: 'Me pidieron llegar a 55%',
          createdAt: '',
        },
      ],
    })
    const out = content((r) => {
      must(r.stories[0]).task = {
        text: 'The goal was 55%.',
        citedEvidenceIds: ['answer:ans_1'],
        ask: '',
        ideas: [],
      }
    }, c)
    expect(checkPrepInCode(out, c)).toEqual([])
  })

  it('never lets a figure that was only in the question ground a claim', () => {
    // 2026-11-19 audit: the answer record's text carried the question, so
    // "¿Subiste el ROAS 30%?" / "sí, bastante" grounded "ROAS rose 30%".
    const c = ctx({
      answers: [
        {
          id: 'ans_2',
          applicationId: 'app_1',
          evidenceIds: ['ev_funnel'],
          part: 'R',
          question: '¿Subiste el ROAS 30%?',
          answer: 'Sí, bastante',
          createdAt: '',
        },
      ],
    })
    const out = content((r) => {
      must(r.stories[0]).result = {
        text: 'ROAS rose 30%.',
        citedEvidenceIds: ['answer:ans_2', 'ev_funnel'],
        ask: '',
        ideas: [],
      }
    }, c)
    expect(paths(checkPrepInCode(out, c))).toContain('number@stories.s1.result')
  })

  it('tells a line that stands on his answer alone in his own words', () => {
    const c = ctx({
      answers: [
        {
          id: 'ans_2',
          applicationId: 'app_1',
          evidenceIds: [],
          part: 'R',
          question: '¿Subiste el ROAS 30%?',
          answer: 'Sí, bastante',
          createdAt: '',
        },
      ],
    })
    const out = content((r) => {
      must(r.stories[0]).result = {
        text: 'ROAS rose 30%.',
        citedEvidenceIds: ['answer:ans_2'],
        ask: '',
        ideas: [],
      }
    }, c)
    expect(out.stories[0]?.result.text).toBe('Sí, bastante')
  })

  it('flags a span of years longer than the time on record', () => {
    const out = content((r) => {
      must(r.stories[0]).situation = {
        text: 'After 25 years in ecommerce, I took over the funnel.',
        citedEvidenceIds: ['ev_funnel'],
        ask: '',
        ideas: [],
      }
    })
    expect(paths(checkPrepInCode(out, ctx()))).toContain('number@stories.s1.situation')
  })

  it('flags a known gap claimed in a story, not in the admission', () => {
    const out = content((r) => {
      must(r.stories[0]).action.text = 'I wrote SQL to automate the funnel.'
    })
    const flags = paths(checkPrepInCode(out, ctx()))
    expect(flags).toContain('gap@stories.s1.action')
    expect(flags.some((f) => f.endsWith('gapAnswers.g1.admit'))).toBe(false)
  })

  it('flags project work told as done at an employer', () => {
    const c = ctx({
      evidence: [
        funnel,
        budget,
        { ...must(input().evidence[1], 'bid'), strength: 'core' as const },
      ],
    })
    const out = content((r) => {
      must(r.stories[0]).action = {
        text: 'At Shopco I wrote a script that adjusted bids nightly.',
        citedEvidenceIds: ['ev_bid'],
        ask: '',
        ideas: [],
      }
    }, c)
    expect(paths(checkPrepInCode(out, c))).toContain('placement@stories.s1.action')
  })
})

describe('findPrepTells', () => {
  it('finds an AI tell in a spoken field', () => {
    const out = content((r) => {
      must(r.stories[0]).action.text = 'I leveraged automation to seamlessly drive results.'
    })
    expect(findPrepTells(out, 'en').map((t) => t.path)).toContain('stories.s1.action')
  })

  it('checks the short version against the story’s records (final review #1)', () => {
    const out = content((r) => {
      must(r.stories[0], 'story').short = ['Automated the funnel', 'CR held at 70%']
    })
    expect(paths(checkPrepInCode(out, ctx()))).toContain('number@stories.s1.short.1')
  })

  it('checks numbers in admit, plan, the memory note and the interviewer note against all his records (#2, #8)', () => {
    const out = content((r) => {
      const g = must(r.gapAnswers[0], 'gap')
      g.plan = 'Like when I raised ROAS to 6x, I would learn it fast.'
      g.admit = 'I have not used SQL, though conversion was 45%.'
      r.interviewerNote = 'Lead with your 70% growth.'
    })
    const flags = paths(checkPrepInCode(out, ctx()))
    expect(flags).toContain('number@gapAnswers.g1.plan')
    expect(flags).not.toContain('number@gapAnswers.g1.admit')
    expect(flags).toContain('number@interviewerNote')
  })
})
