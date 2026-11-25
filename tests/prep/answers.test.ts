import { describe, expect, it } from 'vitest'
import { deleteAnswer, listAnswers, replaceAnswer } from '@/lib/db/queries/prep'
import { seedApp, withDb } from '../support/db-app'

describe('his own answers', () => {
  it('replaces the answer in the same slot instead of keeping two', () => {
    withDb((db) => {
      const a = seedApp(db)
      const slot = {
        applicationId: a,
        part: 'Q' as const,
        question: 'Why so short?',
        evidenceIds: [],
      }
      replaceAnswer(db, { ...slot, answer: 'The project ended.' })
      replaceAnswer(db, { ...slot, answer: '  The project ended when the brand left.  ' })
      const all = listAnswers(db, a)
      expect(all).toHaveLength(1)
      expect(all[0]?.answer).toBe('The project ended when the brand left.')
    })
  })

  it('keeps different slots apart, and deletes only within its application', () => {
    withDb((db) => {
      const a = seedApp(db)
      const b = seedApp(db)
      const id = replaceAnswer(db, {
        applicationId: a,
        part: 'D',
        question: 'How it went',
        answer: 'They asked about budgets.',
        evidenceIds: [],
      })
      replaceAnswer(db, {
        applicationId: a,
        part: 'T',
        question: 'Story: Task',
        answer: 'Grow sellers.',
        evidenceIds: ['ev_1'],
      })
      expect(deleteAnswer(db, b, id)).toBe(false)
      expect(listAnswers(db, a)).toHaveLength(2)
      expect(deleteAnswer(db, a, id)).toBe(true)
      expect(listAnswers(db, a).map((x) => x.part)).toEqual(['T'])
    })
  })
})

describe('a question he already answered', () => {
  it('points to his answer by id, even reworded; an unknown answer id points nowhere', async () => {
    const { buildPrepContext } = await import('@/lib/prep/context')
    const { sanitizePrep } = await import('@/lib/prep/sanitize')
    const { input } = await import('./fixtures')
    const { rawPrep } = await import('./raw')
    const base = input()
    const ctx = buildPrepContext({
      ...base,
      answers: [
        {
          id: 'a1',
          applicationId: 'app_1',
          part: 'Q',
          question: 'Why so short?',
          answer: 'The contract ended.',
          evidenceIds: [],
          createdAt: '2026-11-24T00:00:00Z',
        },
      ],
    })
    const raw = rawPrep()
    const q = raw.questions[0]
    if (!q) throw new Error('fixture')
    raw.questions = [
      { ...q, id: 'q1', text: 'Your last two roles were short. Why?', answeredBy: 'answer:a1' },
      { ...q, id: 'q2', text: 'Why that company?', answeredBy: 'answer:nope' },
    ]
    const out = sanitizePrep(raw, ctx)
    expect(out.questions.map((x) => x.answeredBy)).toEqual(['answer:a1', ''])
    expect(out.coverage.map((c) => c.by)).toEqual(['story', 'none'])
  })
})

describe('his own plan for a gap', () => {
  it('replaces the suggested plan, in his words', async () => {
    const { buildPrepContext } = await import('@/lib/prep/context')
    const { sanitizePrep } = await import('@/lib/prep/sanitize')
    const { input } = await import('./fixtures')
    const { rawPrep } = await import('./raw')
    const ctx = buildPrepContext({
      ...input(),
      answers: [
        {
          id: 'p1',
          applicationId: 'app_1',
          part: 'P',
          question: 'SQL',
          answer: ' Tomo el curso de la empresa la primera semana. ',
          evidenceIds: [],
          createdAt: '2026-11-24T00:00:00Z',
        },
      ],
    })
    const out = sanitizePrep(rawPrep(), ctx)
    expect(out.gapAnswers[0]?.plan).toBe('Tomo el curso de la empresa la primera semana.')
  })
})
