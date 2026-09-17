import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Spec §12 gate 1 — adversarial grounding. A profile lacking skill X and a
 * posting demanding X: the CV must never claim X, the gap must surface in the
 * analysis, and the cover letter must be told about it rather than left to
 * paper over it. This is the failure that can cost an offer, so the model is
 * played by an adversary here: it tries to claim X, citing real evidence,
 * using the posting's own word.
 */

const callStructuredMock = vi.fn()
const composeCvMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))
vi.mock('@/lib/ai/stages/compose-cv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/stages/compose-cv')>(
    '@/lib/ai/stages/compose-cv',
  )
  return { ...actual, composeCv: composeCvMock }
})

const { composeAndVerify } = await import('@/lib/ai/compose')
const { composeAndVerifyCompanion } = await import('@/lib/ai/companion')
const { computeCoverage } = await import('@/lib/coverage')

import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'

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
      period: { start: '2016-01', end: '2018-06' },
      summary: '',
    },
  ],
  education: [],
  skills: [{ category: 'Infra', items: ['Docker'] }],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

/** The profile knows Docker. It has never touched Kubernetes. */
const evidence: EvidenceItem[] = [
  {
    id: 'ev_docker',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Containerised the checkout service with Docker',
    metrics: [],
    tags: ['docker'],
    period: { start: '2016-01', end: '2018-06' },
    strength: 'core',
    origin: 'manual',
  },
]

/** The posting demands Kubernetes and mentions Docker. */
const requirements: Requirement[] = [
  {
    id: 'req_k8s',
    text: 'Production Kubernetes experience required',
    keyword: 'Kubernetes',
    variants: ['K8s'],
    kind: 'hard',
    mandatory: true,
    weight: 3,
  },
  {
    id: 'req_docker',
    text: 'Docker',
    keyword: 'Docker',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
  },
]

/** What stage ② should have produced: Docker strong, Kubernetes nothing. */
const mappings: EvidenceMapping[] = [
  { requirementId: 'req_k8s', evidenceIds: [], strength: 'none', rationale: 'No evidence.' },
  { requirementId: 'req_docker', evidenceIds: ['ev_docker'], strength: 'strong', rationale: '' },
]

function cvWith(text: string): CVContent {
  return {
    header: { fullName: 'G', title: 'Engineer', contactLines: [] },
    summary: '',
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Engineer',
        company: 'Tiendamax',
        startDate: '2016-01',
        endDate: '2018-06',
        bullets: [{ id: 'b1', text, citedEvidenceIds: ['ev_docker'], keywordsUsed: [] }],
      },
    ],
    education: [],
    skills: [],
    extras: [],
  }
}

const composeArgs = {
  profile,
  requirements,
  mappings,
  evidence,
  language: 'en' as const,
  market: 'us-remote' as const,
  companyTone: '',
  company: 'Acme',
  jobTitle: 'Platform Engineer',
  // The posting's own vocabulary — the excuse that must NOT cover a known gap.
  postingVocabulary: new Set(['kubernetes', 'k8s', 'docker']),
}

const ADVERSARIAL = 'Migrated the checkout service to Kubernetes on Docker'
const HONEST = 'Containerised the checkout service with Docker'

describe('adversarial grounding — the profile lacks X, the posting demands X', () => {
  beforeEach(() => {
    callStructuredMock.mockReset()
    composeCvMock.mockReset()
  })

  it('the gap surfaces in the analysis as a missing mandatory requirement', () => {
    const coverage = computeCoverage(requirements, mappings)
    expect(coverage.mandatoryMissing).toBe(1)
    expect(coverage.verdict).not.toBe('strong')
  })

  it('a CV that claims X is sent back for repair naming X, and the honest rewrite ships verified', async () => {
    composeCvMock.mockResolvedValueOnce(cvWith(ADVERSARIAL)).mockResolvedValueOnce(cvWith(HONEST))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { cv, report } = await composeAndVerify(composeArgs)

    const repair: string = composeCvMock.mock.calls[1][0].repairInstruction
    expect(repair.toLowerCase()).toContain('kubernetes')
    expect(repair.toLowerCase()).toContain('gap')
    expect(JSON.stringify(cv).toLowerCase()).not.toContain('kubernetes')
    expect(report.passed).toBe(true)
  })

  it('if the model insists on X after the repair, the CV fails verification — nothing ships silently', async () => {
    composeCvMock.mockResolvedValue(cvWith(ADVERSARIAL))
    callStructuredMock.mockResolvedValue({ verdicts: [] })

    const { report } = await composeAndVerify(composeArgs)

    expect(report.passed).toBe(false)
    expect(report.claimedGaps).toEqual([
      {
        bulletId: 'b1',
        keyword: 'kubernetes',
        requirementText: 'Production Kubernetes experience required',
      },
    ])
    // A bullet that already failed in code is not worth a model call.
    expect(callStructuredMock).not.toHaveBeenCalled()
  })

  it('the variant spelling is caught too — "K8s" is the same claim', async () => {
    composeCvMock.mockResolvedValue(cvWith('Ran the K8s cluster for checkout'))
    callStructuredMock.mockResolvedValue({ verdicts: [] })

    const { report } = await composeAndVerify(composeArgs)
    expect(report.claimedGaps.map((g) => g.keyword)).toEqual(['k8s'])
  })

  it('a candidate bullet the distortion model returns no verdict for fails closed', async () => {
    // The honest bullet passes every code check, so it IS sent to the model —
    // which then drops its verdict from the batch (an incomplete response).
    composeCvMock.mockResolvedValue(cvWith(HONEST))
    callStructuredMock.mockResolvedValue({ verdicts: [] })

    const { report } = await composeAndVerify(composeArgs)

    // A missing verdict must be treated as unsupported, never a silent pass.
    expect(report.passed).toBe(false)
    expect(report.distortions.map((d) => d.bulletId)).toEqual(['b1'])
    expect(callStructuredMock).toHaveBeenCalled()
  })

  it('a soft-requirement keyword in an honest bullet is not a claimed gap', async () => {
    const softReqs: Requirement[] = [
      ...requirements,
      {
        id: 'req_collab',
        text: 'Cross-functional collaboration',
        keyword: 'collaboration',
        variants: [],
        kind: 'soft',
        mandatory: false,
        weight: 1,
      },
    ]
    const softMappings: EvidenceMapping[] = [
      ...mappings,
      { requirementId: 'req_collab', evidenceIds: [], strength: 'none', rationale: 'No evidence.' },
    ]
    composeCvMock.mockResolvedValue(
      cvWith('Drove cross-functional collaboration on the Docker rollout'),
    )
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify({
      ...composeArgs,
      requirements: softReqs,
      mappings: softMappings,
    })

    // Before the scoping fix, the unmapped soft word "collaboration" hard-failed
    // an honest, cited bullet. Only hard-requirement gaps are claimable.
    expect(report.claimedGaps).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('the cover letter is told the gap by name, so it can address it instead of papering over it', async () => {
    callStructuredMock.mockResolvedValue({ paragraphs: [] })

    await composeAndVerifyCompanion('coverLetter', {
      profile,
      requirements,
      mappings,
      evidence,
      language: 'en',
      company: 'Acme',
      jobTitle: 'Platform Engineer',
    })

    const prompt = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(prompt).toContain('<gaps>Kubernetes</gaps>')
    // …and it never sees evidence that was not selected for this application.
    expect(prompt).toContain('ev_docker')
  })
})
