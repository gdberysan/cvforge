import { describe, expect, it } from 'vitest'
import { type GapEntry, groupEntriesByRole } from '@/lib/gaps/group'

const entry = (over: Partial<GapEntry> & { requirementId: string }): GapEntry => ({
  roleId: 'exp_1',
  question: 'What did you do with this, when, and what changed?',
  answer: 'Something real.',
  ...over,
})

describe('groupEntriesByRole', () => {
  it('collapses several gaps at one employer into a single group', () => {
    const groups = groupEntriesByRole([
      entry({ requirementId: 'req_1' }),
      entry({ requirementId: 'req_2' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].roleId).toBe('exp_1')
    expect(groups[0].answers.map((a) => a.questionId)).toEqual(['req_1', 'req_2'])
  })

  it('keeps separate employers in separate groups, in first-appearance order', () => {
    const groups = groupEntriesByRole([
      entry({ requirementId: 'req_1', roleId: 'exp_2' }),
      entry({ requirementId: 'req_2', roleId: 'exp_1' }),
      entry({ requirementId: 'req_3', roleId: 'exp_2' }),
    ])

    expect(groups.map((g) => g.roleId)).toEqual(['exp_2', 'exp_1'])
    expect(groups[0].answers).toHaveLength(2)
  })

  it('drops a gap the user left blank, so skipping costs nothing', () => {
    const groups = groupEntriesByRole([
      entry({ requirementId: 'req_1', answer: '   ' }),
      entry({ requirementId: 'req_2', answer: 'Real.' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].answers.map((a) => a.questionId)).toEqual(['req_2'])
  })

  it('drops an answered gap with no role chosen rather than guessing an employer', () => {
    expect(groupEntriesByRole([entry({ requirementId: 'req_1', roleId: '' })])).toEqual([])
  })

  it('carries the question through verbatim', () => {
    const groups = groupEntriesByRole([
      entry({ requirementId: 'req_1', question: 'Salesforce: what did you do?' }),
    ])
    expect(groups[0].answers[0].question).toBe('Salesforce: what did you do?')
    expect(groups[0].answers[0].answer).toBe('Something real.')
  })
})
