import { describe, expect, it } from 'vitest'
import { buildPrepContext } from '@/lib/prep/context'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { must } from '../support/must'
import { input } from './fixtures'
import { rawPrep } from './raw'

const ctx = (over = {}) => buildPrepContext(input(over), Date.parse('2026-10-18T09:00:00Z'))

describe('sanitizePrep', () => {
  it('drops evidence ids the context does not hold, keeping answer ids it does', () => {
    const raw = rawPrep()
    must(raw.stories[0]).action.citedEvidenceIds = [
      'ev_funnel',
      'ev_made_up',
      'answer:ans_1',
      'answer:ans_nope',
    ]
    const c = ctx({
      answers: [
        {
          id: 'ans_1',
          applicationId: 'app_1',
          evidenceIds: [],
          part: 'A',
          question: 'q',
          answer: 'a',
          createdAt: '',
        },
      ],
    })
    expect(sanitizePrep(raw, c).stories[0]?.action.citedEvidenceIds).toEqual([
      'ev_funnel',
      'answer:ans_1',
    ])
  })

  it('drops unknown requirement ids and defence cards for bullets the CV does not have', () => {
    const raw = rawPrep()
    must(raw.questions[0]).requirementIds = ['req_1', 'req_99']
    raw.cvDefense.push({
      bulletId: 'b404',
      likelyQuestion: 'x',
      facts: { text: 'y', citedEvidenceIds: [] },
    })
    const out = sanitizePrep(raw, ctx())
    expect(out.questions[0]?.requirementIds).toEqual(['req_1'])
    expect(out.cvDefense.map((d) => d.bulletId)).toEqual(['b1'])
  })

  it('drops a gap answer for a requirement that does not exist', () => {
    const raw = rawPrep()
    raw.gapAnswers.push({
      id: 'g2',
      requirementId: 'req_99',
      admit: 'a',
      bridge: { text: '', citedEvidenceIds: [] },
      plan: 'p',
    })
    expect(sanitizePrep(raw, ctx()).gapAnswers.map((g) => g.id)).toEqual(['g1'])
  })

  it('re-points answeredBy that names nothing, and computes coverage', () => {
    const raw = rawPrep()
    must(raw.questions[0]).answeredBy = 's9'
    const out = sanitizePrep(raw, ctx())
    expect(out.questions[0]?.answeredBy).toBe('')
    expect(out.coverage).toEqual([
      { questionId: 'q1', by: 'none', targetId: '' },
      { questionId: 'q2', by: 'gap', targetId: 'g1' },
      { questionId: 'q3', by: 'none', targetId: '' },
    ])
  })

  it('keeps an empty beat as a note with memory prompts that are questions and carry no number', () => {
    const out = sanitizePrep(rawPrep(), ctx())
    expect(out.stories[0]?.task).toEqual({
      text: '',
      citedEvidenceIds: [],
      ask: 'Tu registro no dice cuál era la meta.',
      ideas: ['¿Qué pedía tu jefe cuando empezaste?'],
    })
  })

  it('keeps at most three memory prompts, and none on a beat that has text', () => {
    const raw = rawPrep()
    const story = must(raw.stories[0], 'story')
    story.action.ideas = ['¿Uno?']
    story.task.ideas = ['¿A?', '¿B?', '¿C?', '¿D?']
    const out = sanitizePrep(raw, ctx())
    expect(out.stories[0]?.action.ideas).toEqual([])
    expect(out.stories[0]?.task.ideas).toEqual(['¿A?', '¿B?', '¿C?'])
  })

  it('drops a memory prompt that carries a number in words (#6)', () => {
    const raw = rawPrep()
    must(raw.stories[0], 'story').task.ideas = [
      '¿Fueron treinta días?',
      '¿Lograste duplicar las ventas?',
      'Did it double?',
      '¿Quién te pidió el cambio?',
    ]
    expect(sanitizePrep(raw, ctx()).stories[0]?.task.ideas).toEqual(['¿Quién te pidió el cambio?'])
  })

  it('keeps the CV line each defense card is about, as it read when the prep was made', () => {
    const out = sanitizePrep(
      rawPrep(),
      buildPrepContext(input(), Date.parse('2026-10-18T09:00:00Z')),
    )
    expect(out.cvDefense[0]?.line).toBe('Automated the signup flow to a steady 45% conversion')
  })
})
