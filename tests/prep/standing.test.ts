import { describe, expect, it } from 'vitest'
import { buildPrepContext } from '@/lib/prep/context'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { standings } from '@/lib/prep/standing'
import { must } from '../support/must'
import { input } from './fixtures'
import { rawPrep } from './raw'

const ctx = buildPrepContext(input())
const keywordOf = new Map(ctx.requirements.map((r) => [r.id, r.keyword]))
const base = () => sanitizePrep(rawPrep(), ctx)
const q = (over: Partial<ReturnType<typeof base>['questions'][number]>) => ({
  ...must(base().questions[0]),
  answeredBy: '',
  know: '',
  ...over,
})

describe('standings', () => {
  it('counts a question naming a lacked requirement as honestly answered', () => {
    const c = base()
    const gap = must(c.gapAnswers[0])
    c.questions = [
      q({ id: 'qa', text: 'Which tools have you used?', requirementIds: [gap.requirementId] }),
    ]
    expect(standings(c, [], keywordOf).get('qa')).toEqual({ by: 'gap', gapId: gap.id })
  })

  it('counts his own plan for a requirement as an honest answer', () => {
    const c = base()
    c.gapAnswers = []
    c.questions = [q({ id: 'qb', text: 'Do you know SQL?', requirementIds: ['req_2'] })]
    const plan = [{ id: 'p', part: 'P', question: 'SQL' }]
    expect(standings(c, plan, keywordOf).get('qb')?.by).toBe('gap')
    expect(standings(c, [], keywordOf).get('qb')?.by).toBe('none')
  })

  it('keeps salary, start date and motive out of "add it to your experience"', () => {
    const c = base()
    c.gapAnswers = []
    c.questions = [
      q({
        id: 's',
        text: 'What are your salary expectations and when could you start?',
        requirementIds: ['req_3'],
      }),
      q({ id: 'w', text: 'Why this company?', requirementIds: [] }),
      q({ id: 'k', text: 'How do you build a dashboard?', requirementIds: ['req_1'] }),
    ]
    const s = standings(c, [], keywordOf)
    expect([s.get('s')?.by, s.get('w')?.by, s.get('k')?.by]).toEqual([
      'personal',
      'personal',
      'none',
    ])
  })

  it('counts a question he answered in writing as his', () => {
    const c = base()
    c.questions = [q({ id: 'm', text: 'How do you build a dashboard?', requirementIds: ['req_1'] })]
    const mine = [{ id: 'x', part: 'Q', question: 'How do you build a dashboard?' }]
    expect(standings(c, mine, keywordOf).get('m')?.by).toBe('story')
  })
})
