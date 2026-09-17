import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { planInterview, structureAnswers } = await import('@/lib/ai/stages/interview')
const { InterviewResultSchema } = await import('@/lib/schemas')

import type { EvidenceItem, Experience } from '@/lib/schemas'

const role: Experience = {
  id: 'exp_1',
  title: 'Backend Engineer',
  company: 'Tiendamax',
  period: { start: '2016-01', end: '2018-06' },
  summary: '',
}

const stubs: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Rebuilt the checkout flow',
    metrics: [],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  },
]

function modelEvidence(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'ev_new',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Rebuilt the checkout flow, cutting drop-off',
    metrics: [],
    tags: ['ecommerce'],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
    ...over,
  }
}

describe('planInterview', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('caps the question set at six so a role does not become a chore', async () => {
    callStructuredMock.mockResolvedValue({
      questions: Array.from({ length: 12 }, (_, i) => ({
        id: `q${i}`,
        targetStubId: 'ev_1',
        question: `Question ${i}?`,
        why: 'because',
        probesFor: 'metric' as const,
      })),
    })
    expect(await planInterview({ role, stubs })).toHaveLength(6)
  })

  it('passes the role and its stubs to the model', async () => {
    callStructuredMock.mockResolvedValue({ questions: [] })
    await planInterview({ role, stubs })

    const call = JSON.stringify(callStructuredMock.mock.calls[0][0])
    expect(call).toContain('Tiendamax')
    expect(call).toContain('Rebuilt the checkout flow')
    expect(call).toContain('ev_1')
  })

  it('asks its questions in the UI language', async () => {
    // The person answers in whatever language they think in; the QUESTIONS
    // must meet them there. English questions inside a Spanish UI read as a
    // seam in the product.
    callStructuredMock.mockResolvedValue({ questions: [] })
    await planInterview({ role, stubs, locale: 'es' })
    expect((callStructuredMock.mock.calls[0][0].user as string).toLowerCase()).toContain('spanish')

    callStructuredMock.mockClear()
    callStructuredMock.mockResolvedValue({ questions: [] })
    await planInterview({ role, stubs })
    expect((callStructuredMock.mock.calls[0][0].user as string).toLowerCase()).not.toContain(
      'spanish',
    )
  })

  it('shows already-recorded evidence to the planner without treating it as stubs', async () => {
    // On a re-run, real records give the planner context so it does not
    // re-ask — but they are not scaffolding and must stay out of <stubs>.
    callStructuredMock.mockResolvedValue({ questions: [] })
    const existing: EvidenceItem[] = [
      { ...stubs[0], id: 'ev_9', text: 'Built the supplier retry library', origin: 'interview' },
    ]
    await planInterview({ role, stubs, existing })

    const user = callStructuredMock.mock.calls[0][0].user as string
    expect(user).toContain('Built the supplier retry library')
    const stubsBlock = user.slice(user.indexOf('<stubs>'), user.indexOf('</stubs>'))
    expect(stubsBlock).not.toContain('Built the supplier retry library')
  })
})

describe('structureAnswers', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('strips a metric the user never stated', async () => {
    callStructuredMock.mockResolvedValue({
      evidence: [
        modelEvidence({
          metrics: [{ raw: 'cut drop-off 40%', value: 40, unit: '%', direction: 'down' }],
        }),
      ],
    })

    const result = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'What changed?', answer: 'It got a lot better.' }],
    })

    expect(result.evidence[0].metrics).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
  })

  it('does not let a number that appeared only in the question ground a metric', async () => {
    // "Was it around 30%?" / "Roughly, yes." must record NO metric — the
    // figure came from the interviewer, not the person answering.
    callStructuredMock.mockResolvedValue({
      evidence: [
        modelEvidence({
          metrics: [{ raw: 'cut drop-off 30%', value: 30, unit: '%', direction: 'down' }],
        }),
      ],
    })

    const result = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'Was it around 30%?', answer: 'Roughly, yes.' }],
    })

    expect(result.evidence[0].metrics).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
  })

  it('keeps a metric the user did state', async () => {
    callStructuredMock.mockResolvedValue({
      evidence: [
        modelEvidence({
          metrics: [{ raw: 'cut drop-off 18%', value: 18, unit: '%', direction: 'down' }],
        }),
      ],
    })

    const result = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'What changed?', answer: 'Drop-off fell 18%.' }],
    })

    expect(result.evidence[0].metrics).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
  })

  it('forces every produced item to belong to the interviewed role', async () => {
    callStructuredMock.mockResolvedValue({
      evidence: [modelEvidence({ sourceRef: { type: 'experience', id: 'exp_WRONG' } })],
    })

    const result = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'q', answer: 'a' }],
    })

    expect(result.evidence[0].sourceRef).toEqual({ type: 'experience', id: 'exp_1' })
  })

  it('assigns fresh ids so re-running cannot overwrite existing evidence', async () => {
    callStructuredMock.mockResolvedValue({ evidence: [modelEvidence({ id: 'ev_1' })] })

    const result = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'q', answer: 'a' }],
    })

    expect(result.evidence[0].id).not.toBe('ev_1')
    expect(result.evidence[0].id).toMatch(/^ev_/)
  })

  it('sends only answered questions to the model', async () => {
    callStructuredMock.mockResolvedValue({ evidence: [] })

    await structureAnswers({
      role,
      stubs,
      answers: [
        { questionId: 'q1', question: 'Answered?', answer: 'yes' },
        { questionId: 'q2', question: 'Skipped?', answer: '   ' },
      ],
    })

    const user = callStructuredMock.mock.calls[0][0].user
    expect(user).toContain('Answered?')
    expect(user).not.toContain('Skipped?')
  })
  it('shows the model what this role already has, so it does not record it twice', async () => {
    callStructuredMock.mockResolvedValue({ evidence: [modelEvidence()] })

    await structureAnswers({
      role,
      stubs: [],
      existing: [
        {
          ...modelEvidence(),
          id: 'ev_existing',
          text: 'Configured Salesforce approval workflows for the sales team.',
        },
      ],
      answers: [
        { questionId: 'req_1', question: 'Salesforce?', answer: 'I configured workflows.' },
      ],
    })

    const user = callStructuredMock.mock.calls[0][0].user
    expect(user).toContain('<already-recorded>')
    expect(user).toContain('Configured Salesforce approval workflows for the sales team.')
  })

  it('omits the already-recorded block entirely when the role has nothing yet', async () => {
    callStructuredMock.mockResolvedValue({ evidence: [modelEvidence()] })

    await structureAnswers({
      role,
      stubs: [],
      answers: [
        { questionId: 'req_1', question: 'Salesforce?', answer: 'I configured workflows.' },
      ],
    })

    expect(callStructuredMock.mock.calls[0][0].user).not.toContain('<already-recorded>')
  })
  it('derives the currency when the model names it only as the unit', async () => {
    callStructuredMock.mockResolvedValue({
      evidence: [
        modelEvidence({
          metrics: [{ raw: '450 mil MXN al mes', value: 450_000, unit: 'MXN' }],
        }),
      ],
    })

    const { evidence } = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'Budget?', answer: '450 mil MXN al mes' }],
    })

    expect(evidence[0].metrics[0].currency).toBe('MXN')
  })
  it('lets the model omit a period it cannot know, at the schema that actually gates it', () => {
    // The mocked calls in this file bypass callStructured's validation, so
    // only a direct schema assertion can catch this class: with a required
    // period, a model omitting it was a fatal invalid-output — which made the
    // long-standing `item.period ?? args.role.period` fallback dead code.
    const { period: _p, ...withoutPeriod } = modelEvidence()
    expect(InterviewResultSchema.safeParse({ evidence: [withoutPeriod] }).success).toBe(true)
  })

  it('falls back to the role period when the answers do not date the work', async () => {
    const { period: _dropped, ...withoutPeriod } = modelEvidence()
    callStructuredMock.mockResolvedValue({ evidence: [withoutPeriod] })

    const { evidence } = await structureAnswers({
      role,
      stubs,
      answers: [{ questionId: 'q1', question: 'What did you do?', answer: 'Rebuilt checkout.' }],
    })

    expect(evidence[0].period).toEqual(role.period)
  })
})
