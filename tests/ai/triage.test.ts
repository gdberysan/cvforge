import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractMock = vi.fn()
const mapMock = vi.fn()

vi.mock('@/lib/ai/stages/extract-requirements', () => ({ extractRequirements: extractMock }))
vi.mock('@/lib/ai/stages/map-evidence', () => ({ mapEvidence: mapMock }))

const { runTriage, runRemap } = await import('@/lib/ai/triage')

import type { MasterProfile } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'A',
    headline: '',
    email: 'a@b.com',
    location: 'CDMX',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

describe('runTriage', () => {
  beforeEach(() => {
    extractMock.mockReset()
    mapMock.mockReset()
  })

  it('computes coverage in code, ignoring anything the model claims', async () => {
    extractMock.mockResolvedValue({
      company: 'Acme',
      jobTitle: 'Engineer',
      language: 'en',
      companyTone: '',
      requirements: [
        {
          id: 'req_1',
          text: 'K8s',
          keyword: 'Kubernetes',
          variants: [],
          kind: 'hard',
          mandatory: true,
          weight: 3,
        },
      ],
    })
    mapMock.mockResolvedValue([
      { requirementId: 'req_1', evidenceIds: [], strength: 'none', rationale: 'no evidence' },
    ])

    const result = await runTriage({ postingText: 'Need Kubernetes', profile, evidence: [] })

    expect(result.coverage.mandatoryMissing).toBe(1)
    expect(result.coverage.mandatoryStrong).toBe(0)
    expect(result.coverage.verdict).toBe('stretch')
  })

  it('surfaces a gating requirement as a hard blocker and a skip verdict', async () => {
    extractMock.mockResolvedValue({
      company: 'Acme',
      jobTitle: 'Engineer',
      language: 'en',
      companyTone: '',
      requirements: [
        {
          id: 'req_1',
          text: 'Must be EU-based',
          keyword: 'EU',
          variants: [],
          kind: 'location',
          mandatory: true,
          weight: 3,
        },
      ],
    })
    mapMock.mockResolvedValue([
      { requirementId: 'req_1', evidenceIds: [], strength: 'none', rationale: 'Based in Mexico' },
    ])

    const result = await runTriage({ postingText: 'EU only', profile, evidence: [] })

    expect(result.coverage.verdict).toBe('skip')
    expect(result.coverage.hardBlockers[0].text).toBe('Must be EU-based')
  })

  it('re-maps stored requirements without re-reading the posting', async () => {
    // A cached posting whose evidence base changed re-runs stage ② only:
    // requirements came from the posting, which has not changed.
    mapMock.mockResolvedValue([
      { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: 'now real' },
    ])

    const result = await runRemap({
      requirements: [
        {
          id: 'req_1',
          text: 'K8s',
          keyword: 'Kubernetes',
          variants: [],
          kind: 'hard',
          mandatory: true,
          weight: 3,
        },
      ],
      profile,
      evidence: [
        {
          id: 'ev_1',
          kind: 'achievement',
          sourceRef: { type: 'experience', id: 'exp_1' },
          text: 'Ran the K8s migration',
          metrics: [],
          tags: ['kubernetes'],
          period: { start: '2020-01' },
          strength: 'core',
          origin: 'manual',
        },
      ],
    })

    expect(extractMock).not.toHaveBeenCalled()
    expect(result.coverage.mandatoryStrong).toBe(1)
    expect(result.coverage.verdict).toBe('strong')
    expect(result.mappings[0].evidenceIds).toEqual(['ev_1'])
  })

  it('passes only valid evidence ids to the mapper', async () => {
    extractMock.mockResolvedValue({
      company: 'A',
      jobTitle: 'B',
      language: 'en',
      companyTone: '',
      requirements: [],
    })
    mapMock.mockResolvedValue([])

    await runTriage({
      postingText: 'x',
      profile,
      evidence: [
        {
          id: 'ev_1',
          kind: 'achievement',
          sourceRef: { type: 'experience', id: 'exp_1' },
          text: 't',
          metrics: [],
          tags: [],
          period: { start: '2020-01' },
          strength: 'core',
          origin: 'manual',
        },
      ],
    })

    const passed = mapMock.mock.calls[0][0].validEvidenceIds
    expect(passed.has('ev_1')).toBe(true)
    expect(passed.size).toBe(1)
  })
})
