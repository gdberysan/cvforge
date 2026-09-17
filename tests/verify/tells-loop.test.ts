import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverLetter, EvidenceItem, MasterProfile, Requirement } from '@/lib/schemas'

const composeCoverLetterMock = vi.fn()
const checkDistortionsMock = vi.fn()

vi.mock('@/lib/ai/stages/compose-companion', () => ({
  composeCoverLetter: composeCoverLetterMock,
  composeScreening: vi.fn(),
  composeRecruiterMessage: vi.fn(),
}))
vi.mock('@/lib/ai/stages/verify-distortion', () => ({ checkDistortions: checkDistortionsMock }))

const { composeAndVerifyCompanion } = await import('@/lib/ai/companion')

const profile = {
  basics: { fullName: 'Test', headline: '', email: '', location: '', timezone: '', links: [] },
  summary: '',
  experience: [
    { id: 'exp_1', title: 'Lead', company: 'Alpha', period: { start: '2020-01' }, summary: '' },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as MasterProfile

const evidence: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Ran paid acquisition for two years.',
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  },
]

const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'Paid media',
    keyword: 'paid media',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
  },
]

const letter = (text: string): CoverLetter =>
  ({
    paragraphs: [{ id: 'p1', text, citedEvidenceIds: ['ev_1'] }],
  }) as CoverLetter

const args = {
  profile,
  requirements,
  mappings: [
    { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong' as const, rationale: '' },
  ],
  evidence,
  language: 'en' as const,
  company: 'Beta',
  jobTitle: 'Lead',
}

beforeEach(() => {
  composeCoverLetterMock.mockReset()
  checkDistortionsMock.mockReset()
  checkDistortionsMock.mockResolvedValue([{ bulletId: 'p1', supported: true, reason: '' }])
})

describe('the anti-tell pass', () => {
  it('asks for a rewrite naming the phrases it found', async () => {
    composeCoverLetterMock
      .mockResolvedValueOnce(letter('I am passionate about this — truly seamless work.'))
      .mockResolvedValueOnce(letter('I ran paid acquisition for two years.'))

    const { document } = await composeAndVerifyCompanion('coverLetter', args)

    expect(composeCoverLetterMock).toHaveBeenCalledTimes(2)
    const instruction = composeCoverLetterMock.mock.calls[1][0].repairInstruction as string
    expect(instruction).toContain('passionate about')
    expect(instruction).toContain('seamless')
    expect(instruction).toContain('—')
    expect((document as CoverLetter).paragraphs[0].text).toBe(
      'I ran paid acquisition for two years.',
    )
  })

  it('costs nothing when the draft is already plain', async () => {
    composeCoverLetterMock.mockResolvedValue(letter('I ran paid acquisition for two years.'))

    await composeAndVerifyCompanion('coverLetter', args)

    expect(composeCoverLetterMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the stilted draft when the prettier rewrite breaks grounding', async () => {
    // Fails closed: a rewrite that invented a figure is worse than a cliché,
    // so the original stands and the tell ships instead.
    composeCoverLetterMock
      .mockResolvedValueOnce(letter('I am passionate about paid media.'))
      .mockResolvedValueOnce(letter('I grew revenue 240% in one quarter.'))

    const { document } = await composeAndVerifyCompanion('coverLetter', args)

    expect((document as CoverLetter).paragraphs[0].text).toBe('I am passionate about paid media.')
  })

  it('never runs before grounding is settled', async () => {
    // The first draft fails grounding on an invented figure. That repair must
    // be the grounding one, not the style one.
    composeCoverLetterMock
      .mockResolvedValueOnce(letter('I am passionate about growing revenue 240%.'))
      .mockResolvedValueOnce(letter('I ran paid acquisition for two years.'))

    await composeAndVerifyCompanion('coverLetter', args)

    const first = composeCoverLetterMock.mock.calls[1][0].repairInstruction as string
    expect(first).toContain('failed verification')
    expect(first).not.toContain('machine-written')
  })
})
