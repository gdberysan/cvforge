import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { composeCv, selectEvidenceForComposition } = await import('@/lib/ai/stages/compose-cv')

import type { EvidenceItem, EvidenceMapping, MasterProfile, Requirement } from '@/lib/schemas'

function ev(id: string): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: `text of ${id}`,
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  }
}

const profile: MasterProfile = {
  basics: {
    fullName: 'Alex',
    headline: 'Engineer',
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

const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'TypeScript',
    keyword: 'TypeScript',
    variants: ['TS'],
    kind: 'hard',
    mandatory: true,
    weight: 3,
  },
]

const emptyContent = {
  header: { fullName: 'Alex', title: 'Engineer', contactLines: [] },
  summary: 's',
  experience: [],
  education: [],
  skills: [],
  extras: [],
}

describe('selectEvidenceForComposition', () => {
  it('includes strong and partial evidence and excludes none', () => {
    const mappings: EvidenceMapping[] = [
      { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: '' },
      { requirementId: 'req_2', evidenceIds: ['ev_2'], strength: 'partial', rationale: '' },
      { requirementId: 'req_3', evidenceIds: ['ev_3'], strength: 'none', rationale: '' },
    ]
    const selected = selectEvidenceForComposition(mappings, [ev('ev_1'), ev('ev_2'), ev('ev_3')])
    expect(selected.map((e) => e.id)).toEqual(['ev_1', 'ev_2'])
  })

  it('deduplicates evidence cited by more than one requirement', () => {
    const mappings: EvidenceMapping[] = [
      { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: '' },
      { requirementId: 'req_2', evidenceIds: ['ev_1'], strength: 'partial', rationale: '' },
    ]
    expect(selectEvidenceForComposition(mappings, [ev('ev_1')])).toHaveLength(1)
  })
})

describe('composeCv', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('passes only the selected evidence, never the full base', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)

    await composeCv({
      profile,
      requirements,
      mappings: [
        { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: '' },
      ],
      evidence: [ev('ev_1'), ev('ev_SECRET')],
      language: 'en',
      market: 'us-remote',
      companyTone: 'direct',
      company: 'Acme',
      jobTitle: 'Engineer',
    })

    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('ev_1')
    expect(call).not.toContain('ev_SECRET')
  })

  it('never passes raw posting text', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).not.toContain('<posting>')
  })

  it('instructs es-MX rather than neutral or peninsular Spanish', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'es-MX',
      market: 'mx',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Ingeniero',
    })
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('es-MX')
    expect(call).toMatch(/Mexican|México|mexicano/i)
  })

  it('caches the instruction block but not the per-application block', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    const cached = callStructuredMock.mock.calls[0][0].system.filter(
      (b: { cache?: boolean }) => b.cache,
    )
    expect(cached).toHaveLength(1)
  })

  it('carries the tense rule — an ended role must never sound current', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    expect(JSON.stringify(callStructuredMock.mock.calls[0][0].system)).toMatch(/past tense/i)
  })

  it('passes certifications and education to the composer, not just experience', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    const profileWithCredentials: MasterProfile = {
      ...profile,
      certifications: [
        {
          id: 'cert_1',
          name: 'Google Ads Search Certification',
          issuer: 'Google',
          date: '2024-02',
        },
      ],
      education: [
        {
          id: 'edu_1',
          degree: 'Licenciatura en Mercadotecnia',
          institution: 'UNAM',
          period: { start: '2010-08', end: '2014-06' },
        },
      ],
    }
    await composeCv({
      profile: profileWithCredentials,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('cert_1')
    expect(call).toContain('Google Ads Search Certification')
    expect(call).toContain('edu_1')
  })

  it('tells the model not to filter certifications by literal keyword match against the role', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    expect(JSON.stringify(callStructuredMock.mock.calls[0][0].system)).toMatch(
      /transferable|adjacent/i,
    )
  })

  it('names its stage for the spend counter', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      companyTone: '',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    expect(callStructuredMock.mock.calls[0][0].stage).toBe('compose-cv')
  })
})
