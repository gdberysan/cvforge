import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
const composeCvMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))
vi.mock('@/lib/ai/stages/compose-cv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/stages/compose-cv')>(
    '@/lib/ai/stages/compose-cv',
  )
  return { ...actual, composeCv: composeCvMock }
})

const { checkDistortions } = await import('@/lib/ai/stages/verify-distortion')
const { composeAndVerify } = await import('@/lib/ai/compose')

import type { CVContent, EvidenceItem, MasterProfile } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'G',
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
    text: 'Helped the team migrate checkout',
    metrics: [],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  },
]

function cvWith(text: string): CVContent {
  return {
    header: { fullName: 'G', title: 'E', contactLines: [] },
    summary: '',
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Engineer',
        company: 'Tiendamax',
        startDate: '2016-01',
        bullets: [{ id: 'b1', text, citedEvidenceIds: ['ev_1'], keywordsUsed: [] }],
      },
    ],
    education: [],
    skills: [],
    extras: [],
  }
}

const baseArgs = {
  profile,
  requirements: [],
  mappings: [
    { requirementId: 'r1', evidenceIds: ['ev_1'], strength: 'strong' as const, rationale: '' },
  ],
  evidence,
  language: 'en' as const,
  market: 'us-remote' as const,
  companyTone: '',
  company: 'Acme',
  jobTitle: 'Engineer',
  postingVocabulary: new Set<string>(),
}

describe('checkDistortions', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('runs at low effort and batches every bullet into one call', async () => {
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    await checkDistortions([
      { id: 'b1', text: 'x', sources: ['s'] },
      { id: 'b2', text: 'y', sources: ['s'] },
    ])
    expect(callStructuredMock).toHaveBeenCalledTimes(1)
    expect(callStructuredMock.mock.calls[0][0].effort).toBe('low')
  })

  it('returns an empty array without calling the model when there are no bullets', async () => {
    expect(await checkDistortions([])).toEqual([])
    expect(callStructuredMock).not.toHaveBeenCalled()
  })
})

describe('composeAndVerify', () => {
  beforeEach(() => {
    callStructuredMock.mockReset()
    composeCvMock.mockReset()
  })

  it('returns a passing report without a repair pass when everything checks out', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify(baseArgs)
    expect(report.passed).toBe(true)
    expect(composeCvMock).toHaveBeenCalledTimes(1)
  })

  it('regenerates once when the deterministic checks fail, naming the problem', async () => {
    composeCvMock
      .mockResolvedValueOnce(cvWith('Cut abandonment 40%'))
      .mockResolvedValueOnce(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify(baseArgs)

    expect(composeCvMock).toHaveBeenCalledTimes(2)
    expect(composeCvMock.mock.calls[1][0].repairInstruction).toContain('40%')
    expect(report.passed).toBe(true)
  })

  it('gives up after exactly one repair and reports the remaining problems', async () => {
    composeCvMock.mockResolvedValue(cvWith('Cut abandonment 40%'))
    callStructuredMock.mockResolvedValue({ verdicts: [] })

    const { report } = await composeAndVerify(baseArgs)

    expect(composeCvMock).toHaveBeenCalledTimes(2)
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers).toHaveLength(1)
  })

  it('annotates every source with its period so tense is checkable', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    await composeAndVerify(baseArgs)
    // The evidence has an open period; the source line carries it.
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain('[2016-01–present]')
  })

  it('records a distortion verdict on the report', async () => {
    composeCvMock.mockResolvedValue(cvWith('Single-handedly rebuilt checkout'))
    callStructuredMock.mockResolvedValue({
      verdicts: [
        {
          bulletId: 'b1',
          supported: false,
          reason: 'Source says "helped the team", not single-handedly.',
        },
      ],
    })

    const { report } = await composeAndVerify(baseArgs)
    expect(report.distortions[0].reason).toContain('helped the team')
    expect(report.passed).toBe(false)
  })
})
