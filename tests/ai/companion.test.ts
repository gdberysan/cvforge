import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const {
  composeCoverLetter,
  composeScreening,
  composeRecruiterMessage,
  composeScreeningAnswer,
  readCoverLetter,
  readRecruiterMessage,
  readScreeningAnswer,
  readScreeningSet,
} = await import('@/lib/ai/stages/compose-companion')
const { AiError } = await import('@/lib/ai/errors')
const { composeAndVerifyCompanion, withGapSources } = await import('@/lib/ai/companion')

import type { EvidenceItem, MasterProfile, Requirement } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'Ana',
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
  languages: [{ language: 'Inglés', level: 'C1' }],
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

/** The smallest answers the readers accept: one item with text. */
const LETTER = { paragraphs: [{ id: 'p1', text: 'Hola.', citedEvidenceIds: [] }] }
const SCREENING = {
  answers: [{ id: 'q1', question: '¿Por qué tú?', answer: 'Por esto.', citedEvidenceIds: [] }],
}

describe('reading what the model wrote — the companion schemas carry no minimums', () => {
  it('the model-facing schemas send no minLength, minItems or enum to the API', async () => {
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
    const schemas = await import('@/lib/schemas/companion')
    for (const schema of [
      schemas.ModelCoverLetterSchema,
      schemas.ModelScreeningSetSchema,
      schemas.ModelScreeningAnswerSchema,
      schemas.ModelRecruiterMessageSchema,
    ]) {
      const grammar = JSON.stringify(zodOutputFormat(schema as never).schema)
      // Descriptions may carry the old wording; no enforced keyword may (minItems is enforced by the API).
      expect(grammar).not.toMatch(/"minLength":|"enum":|"pattern":/)
    }
  })

  it('a cover letter drops a paragraph with no text and numbers one with no id', () => {
    const letter = readCoverLetter({
      paragraphs: [
        { id: '', text: 'Primero.', citedEvidenceIds: [] },
        { id: 'p2', text: '   ', citedEvidenceIds: ['ev_1'] },
        { id: 'p3', text: 'Cierre.', citedEvidenceIds: [] },
      ],
    })
    expect(letter.paragraphs.map((p) => [p.id, p.text])).toEqual([
      ['p1', 'Primero.'],
      ['p3', 'Cierre.'],
    ])
  })

  it('a repeated paragraph id gets its own, so two paragraphs never share a flag', () => {
    const letter = readCoverLetter({
      paragraphs: [
        { id: 'p1', text: 'Uno.', citedEvidenceIds: [] },
        { id: 'p1', text: 'Dos.', citedEvidenceIds: [] },
      ],
    })
    expect(letter.paragraphs.map((p) => p.id)).toEqual(['p1', 'p1-2'])
  })

  it('a cover letter with nothing written is an error, never an empty letter', () => {
    expect(() => readCoverLetter({ paragraphs: [] })).toThrow(AiError)
    expect(() =>
      readCoverLetter({ paragraphs: [{ id: 'p1', text: ' ', citedEvidenceIds: [] }] }),
    ).toThrow(/no text/)
  })

  it('screening drops an answer with no question or no answer, and the code sets source', () => {
    const set = readScreeningSet({
      answers: [
        {
          id: 'q1',
          question: '¿Por qué tú?',
          answer: 'Por esto.',
          citedEvidenceIds: [],
          source: 'user',
        },
        { id: 'q2', question: '', answer: 'Huérfana.', citedEvidenceIds: [], source: 'ai' },
        { id: 'q3', question: '¿Kubernetes?', answer: '', citedEvidenceIds: [], source: 'ai' },
        { id: '', question: '¿Inglés?', answer: 'C1.', citedEvidenceIds: [], source: 'ai' },
      ],
    })
    expect(set.answers.map((a) => [a.id, a.question, a.source])).toEqual([
      ['q1', '¿Por qué tú?', 'ai'],
      ['q2', '¿Inglés?', 'ai'],
    ])
  })

  it('a screening set with nothing answered is an error', () => {
    expect(() => readScreeningSet({ answers: [] })).toThrow(AiError)
  })

  it("a single answer keeps the caller's question, fills its id, and fails when empty", () => {
    const answer = readScreeningAnswer(
      { id: '', question: '', answer: 'Sí.', citedEvidenceIds: [], source: 'ai' },
      '¿Disponibilidad?',
    )
    expect(answer).toMatchObject({ id: 'q_custom', question: '¿Disponibilidad?', source: 'user' })
    expect(() =>
      readScreeningAnswer(
        { id: 'q', question: 'x', answer: '  ', citedEvidenceIds: [], source: 'ai' },
        'x',
      ),
    ).toThrow(AiError)
  })

  it('a recruiter message with no text is an error', () => {
    expect(readRecruiterMessage({ text: 'Hola', citedEvidenceIds: [] }).text).toBe('Hola')
    expect(() => readRecruiterMessage({ text: '', citedEvidenceIds: [] })).toThrow(AiError)
  })

  it('composeCoverLetter returns the read letter, not the raw answer', async () => {
    callStructuredMock.mockReset()
    callStructuredMock.mockResolvedValue({
      paragraphs: [
        { id: '', text: 'Hola.', citedEvidenceIds: [] },
        { id: 'p2', text: '', citedEvidenceIds: [] },
      ],
    })
    const letter = await composeCoverLetter(baseArgs)
    expect(letter.paragraphs).toEqual([{ id: 'p1', text: 'Hola.', citedEvidenceIds: [] }])
  })
})

describe('companion stages', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('the cover letter sees only selected evidence and carries the 300-word limit', async () => {
    callStructuredMock.mockResolvedValue(LETTER)
    await composeCoverLetter(baseArgs)

    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('ev_1')
    expect(call).not.toContain('ev_SECRET')
    expect(call).toContain('300')
    expect(call).toMatch(/Mexican|mexicano/i)
  })

  it('screening receives the answer bank so known questions are reused, not rewritten', async () => {
    callStructuredMock.mockResolvedValue(SCREENING)
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
    callStructuredMock.mockResolvedValue(LETTER)
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
    callStructuredMock.mockResolvedValue(LETTER)
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

  it('a mapped credential is shown, citable, and checked against its own line', async () => {
    // Backlog #1: the mapper matched "English C1" to lang_ingles, but the
    // companion never saw credentials, so the repair loop stripped the
    // strongest match from every letter.
    const args = {
      ...baseArgs,
      mappings: [
        ...baseArgs.mappings,
        {
          requirementId: 'req_2',
          evidenceIds: ['lang_ingles'],
          strength: 'strong' as const,
          rationale: '',
        },
      ],
    }
    callStructuredMock
      .mockResolvedValueOnce({
        paragraphs: [
          { id: 'p1', text: 'Trabajo en inglés a nivel C1.', citedEvidenceIds: ['lang_ingles'] },
        ],
      })
      .mockResolvedValue({ verdicts: [{ bulletId: 'p1', supported: true, reason: '' }] })

    const { report } = await composeAndVerifyCompanion('coverLetter', args)

    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain(
      'lang_ingles | language | Inglés — C1',
    )
    // compose, then the distortion pass — no repair round
    expect(callStructuredMock).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(callStructuredMock.mock.calls[1])).toContain('[credential] lang_ingles')
    expect(report.passed).toBe(true)
  })

  it('an unmapped credential never reaches the companion', async () => {
    callStructuredMock.mockResolvedValue(LETTER)
    await composeCoverLetter(baseArgs)
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).not.toContain('lang_ingles')
  })
})

describe('withGapSources', () => {
  it('hands a paragraph naming a known gap the gap as a source, cited or not', () => {
    const requirements: Requirement[] = [
      {
        id: 'r1',
        text: 'Kubernetes in production',
        keyword: 'Kubernetes',
        variants: [],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
    ]
    const { candidates, sources } = withGapSources(
      [
        { id: 'p1', text: 'Opero Kubernetes a diario.', citedEvidenceIds: [] },
        { id: 'p2', text: 'Me entusiasma el puesto.', citedEvidenceIds: [] },
      ],
      requirements,
      [{ requirementId: 'r1', evidenceIds: [], strength: 'none', rationale: '' }],
    )
    expect(candidates[0].citedEvidenceIds).toEqual(['gap:kubernetes'])
    expect(candidates[1].citedEvidenceIds).toEqual([])
    expect(sources.get('gap:kubernetes')).toContain('Kubernetes in production')
  })
})
