import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { composeCoverLetter, composeScreening, composeRecruiterMessage, composeScreeningAnswer } =
  await import('@/lib/ai/stages/compose-companion')
const { composeAndVerifyCompanion } = await import('@/lib/ai/companion')

import type { EvidenceItem, MasterProfile, Requirement } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'Alex',
    headline: '',
    email: 'g@b.com',
    location: 'CDMX',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Engineer',
      company: 'Tiendamax',
      period: { start: '2016-01' },
      summary: '',
    },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

const evidence: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Cut checkout abandonment by 18%',
    metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%' }],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  },
  {
    id: 'ev_SECRET',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Unselected work',
    metrics: [],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  },
]

const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'TypeScript required',
    keyword: 'TypeScript',
    variants: ['TS'],
    kind: 'hard',
    mandatory: true,
    weight: 3,
  },
]

const baseArgs = {
  profile,
  requirements,
  mappings: [
    { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong' as const, rationale: '' },
  ],
  evidence,
  language: 'es-MX' as const,
  company: 'Acme',
  jobTitle: 'Ingeniero',
}

describe('companion stages', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('the cover letter sees only selected evidence and carries the 300-word limit', async () => {
    callStructuredMock.mockResolvedValue({ paragraphs: [] })
    await composeCoverLetter(baseArgs)

    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('ev_1')
    expect(call).not.toContain('ev_SECRET')
    expect(call).toContain('300')
    expect(call).toMatch(/Mexican|mexicano/i)
  })

  it('screening receives the answer bank so known questions are reused, not rewritten', async () => {
    callStructuredMock.mockResolvedValue({ answers: [] })
    await composeScreening({
      ...baseArgs,
      bank: [{ question: 'Why us?', answer: 'The mission.' }],
    })

    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('Why us?')
    expect(call).toContain('The mission.')
  })

  it('the recruiter message carries the 500-character ceiling', async () => {
    callStructuredMock.mockResolvedValue({ text: 'Hola', citedEvidenceIds: [] })
    await composeRecruiterMessage(baseArgs)
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain('500')
  })

  it('every companion carries the tense rule — an ended role must not sound current', async () => {
    callStructuredMock.mockResolvedValue({ paragraphs: [] })
    await composeCoverLetter(baseArgs)
    expect(JSON.stringify(callStructuredMock.mock.calls[0][0].system)).toMatch(/past tense/i)
  })

  it('the recruiter message addresses the recruiter by name when one is given', async () => {
    callStructuredMock.mockResolvedValue({ text: 'Hola Laura', citedEvidenceIds: [] })
    await composeRecruiterMessage({ ...baseArgs, recruiterName: 'Laura Méndez' })
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain('Laura Méndez')

    callStructuredMock.mockClear()
    callStructuredMock.mockResolvedValue({ text: 'Hola', citedEvidenceIds: [] })
    await composeRecruiterMessage(baseArgs)
    expect(callStructuredMock.mock.calls[0][0].user).not.toContain('recruiter-name')
  })

  it('no companion stage ever sees raw posting text', async () => {
    callStructuredMock.mockResolvedValue({ paragraphs: [] })
    await composeCoverLetter(baseArgs)
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).not.toContain('<posting>')
  })
})

describe('composeScreeningAnswer', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('answers exactly the given question, citing evidence, and reuses the compose pipeline', async () => {
    callStructuredMock.mockResolvedValue({
      id: 'q_custom',
      question: 'Describe your 3P/Seller Central experience.',
      answer: 'Answer grounded in evidence.',
      citedEvidenceIds: ['ev_1'],
    })
    const result = await composeScreeningAnswer({
      ...baseArgs,
      question: 'Describe your 3P/Seller Central experience.',
      bank: [],
    })
    expect(result.question).toBe('Describe your 3P/Seller Central experience.')
    expect(result.source).toBe('user')
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('3P/Seller Central')
    expect(callStructuredMock.mock.calls[0][0].stage).toBe('compose-screening-answer')
  })

  it('reuses a bank answer to essentially the same question', async () => {
    callStructuredMock.mockResolvedValue({
      id: 'q_custom',
      question: 'Years of experience with TypeScript?',
      answer: 'Reused from the bank.',
      citedEvidenceIds: [],
    })
    await composeScreeningAnswer({
      ...baseArgs,
      question: 'Years of experience with TypeScript?',
      bank: [{ question: 'Years of TS experience?', answer: 'Four years.' }],
    })
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain('Four years.')
  })
})

describe('composeAndVerifyCompanion', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('repairs once when a paragraph smuggles an unrecorded number, then surfaces what remains', async () => {
    callStructuredMock
      .mockResolvedValueOnce({
        paragraphs: [{ id: 'p1', text: 'I improve conversion 40%.', citedEvidenceIds: [] }],
      })
      .mockResolvedValueOnce({
        paragraphs: [{ id: 'p1', text: 'I improve conversion, reliably.', citedEvidenceIds: [] }],
      })
      .mockResolvedValue({ verdicts: [{ bulletId: 'p1', supported: true, reason: '' }] })

    const { report } = await composeAndVerifyCompanion('coverLetter', baseArgs)

    // compose, repair-compose, then the distortion pass
    expect(callStructuredMock).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(callStructuredMock.mock.calls[1])).toContain('40%')
    expect(report.passed).toBe(true)
  })

  it('runs the distortion check with period-annotated sources — tense is checkable', async () => {
    callStructuredMock
      .mockResolvedValueOnce({
        paragraphs: [
          { id: 'p1', text: 'Hoy optimizo campañas para Acme.', citedEvidenceIds: ['ev_1'] },
        ],
      })
      .mockResolvedValueOnce({
        verdicts: [
          { bulletId: 'p1', supported: false, reason: 'Ended 2025-08, written as current.' },
        ],
      })

    const { report } = await composeAndVerifyCompanion('coverLetter', baseArgs)

    const distortionCall = JSON.stringify(callStructuredMock.mock.calls[1])
    expect(distortionCall).toContain('2016-01')
    expect(report.distortions).toHaveLength(1)
    expect(report.passed).toBe(false)
  })

  it('verifies screening answers under the same contract', async () => {
    callStructuredMock
      .mockResolvedValueOnce({
        answers: [
          {
            id: 'q1',
            question: '¿Por qué tú?',
            answer: 'Reduje el abandono 18%.',
            citedEvidenceIds: ['ev_1'],
          },
        ],
      })
      .mockResolvedValue({ verdicts: [{ bulletId: 'q1', supported: true, reason: '' }] })

    const { document, report } = await composeAndVerifyCompanion('screening', baseArgs)
    expect(report.passed).toBe(true)
    expect((document as { answers: unknown[] }).answers).toHaveLength(1)
  })

  it('fails closed when the distortion check returns no verdict for a paragraph', async () => {
    // An incomplete batched response used to let the paragraph ship unverified
    // — and be banked as the person's own prior writing.
    callStructuredMock
      .mockResolvedValueOnce({
        answers: [
          {
            id: 'q1',
            question: 'Why you?',
            answer: 'I cut abandonment 18%.',
            citedEvidenceIds: ['ev_1'],
          },
          {
            id: 'q2',
            question: 'Kubernetes?',
            answer: 'I run clusters daily.',
            citedEvidenceIds: ['ev_1'],
          },
        ],
      })
      .mockResolvedValue({ verdicts: [{ bulletId: 'q1', supported: true, reason: '' }] })

    const { report } = await composeAndVerifyCompanion('screening', baseArgs)
    expect(report.distortions.map((d) => d.bulletId)).toEqual(['q2'])
    expect(report.passed).toBe(false)
  })
})
