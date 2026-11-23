import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { composeCv, resolveFromProfile, selectEvidenceForComposition } = await import(
  '@/lib/ai/stages/compose-cv'
)

import { estimatePages } from '@/lib/render/page-budget'
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
    fullName: 'Ana',
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
  header: { fullName: 'Ana', title: 'Engineer', contactLines: [] },
  summary: 's',
  summaryCitedEvidenceIds: [],
  experience: [],
  projects: [],
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
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    expect(callStructuredMock.mock.calls[0][0].stage).toBe('compose-cv')
  })
})

describe('projects on the CV', () => {
  beforeEach(() => callStructuredMock.mockReset())

  const withProject: MasterProfile = {
    ...profile,
    projects: [
      {
        id: 'proj_1',
        name: 'Shelf Tracker',
        description: 'Reporting for paid media teams',
        url: 'github.com/g/shelf',
        stack: ['TypeScript'],
        period: { start: '2024-03' },
      },
    ],
  }
  const bullet = { id: 'b1', text: 'Built it', citedEvidenceIds: ['ev_p'], keywordsUsed: [] }

  it('shows the composer the projects block and the never-an-employer rule', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    await composeCv({
      profile: withProject,
      requirements,
      mappings: [],
      evidence: [],
      language: 'en',
      market: 'us-remote',
      company: 'Acme',
      jobTitle: 'Engineer',
    })
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('proj_1 | Shelf Tracker (own project, not an employer)')
    expect(call).toMatch(/never under a role/)
  })

  it('fills name, link and dates from the record — the model only picks the id', () => {
    const cv = resolveFromProfile(
      { ...emptyContent, projects: [{ projectId: 'proj_1', bullets: [bullet] }] },
      withProject,
    )
    expect(cv.projects).toEqual([
      {
        projectId: 'proj_1',
        name: 'Shelf Tracker',
        url: 'github.com/g/shelf',
        startDate: '2024-03',
        bullets: [bullet],
      },
    ])
  })

  it('drops a project id the profile does not hold, and an empty section', () => {
    const cv = resolveFromProfile(
      {
        ...emptyContent,
        projects: [
          { projectId: 'proj_invented', bullets: [bullet] },
          { projectId: 'proj_1', bullets: [] },
        ],
      },
      withProject,
    )
    expect(cv.projects).toEqual([])
  })

  it('fills employer, location and dates of a role from the record — never the model', () => {
    const record: MasterProfile = {
      ...profile,
      experience: [
        {
          id: 'exp_1',
          title: 'Marketing Specialist',
          company: 'Tiendamax',
          location: 'CDMX',
          period: { start: '2021-03', end: '2023-08' },
          summary: '',
        },
      ],
    }
    const cv = resolveFromProfile(
      {
        ...emptyContent,
        // What a model inflating the heading would send: these fields are not
        // in the draft schema any more, and must not survive if one appears.
        experience: [
          {
            experienceId: 'exp_1',
            title: 'Marketing Specialist',
            company: 'Megacorp',
            startDate: '2019-03',
            bullets: [bullet],
          } as never,
        ],
      },
      record,
    )
    expect(cv.experience).toEqual([
      {
        experienceId: 'exp_1',
        title: 'Marketing Specialist',
        company: 'Tiendamax',
        location: 'CDMX',
        startDate: '2021-03',
        endDate: '2023-08',
        bullets: [bullet],
      },
    ])
  })

  it('drops a role whose id is not on file, with its bullets', () => {
    const cv = resolveFromProfile(
      {
        ...emptyContent,
        experience: [{ experienceId: 'exp_invented', title: 'Head of Growth', bullets: [bullet] }],
      },
      profile,
    )
    expect(cv.experience).toEqual([])
  })

  it('gives a repeated bullet id its own, so a flag names one line', () => {
    const cv = resolveFromProfile(
      {
        ...emptyContent,
        experience: [{ experienceId: 'exp_1', title: 'Engineer', bullets: [bullet, bullet] }],
        projects: [{ projectId: 'proj_1', bullets: [bullet] }],
      },
      withProject,
    )
    const ids = [...cv.experience, ...cv.projects].flatMap((s) => s.bullets.map((b) => b.id))
    expect(ids).toEqual(['b1', 'b1-2', 'b1-3'])
  })
})

describe('fitting the page limit', () => {
  beforeEach(() => callStructuredMock.mockReset())

  const longText =
    'Lideré la estrategia de marketplaces y medios de performance para la categoría, coordinando equipos de catálogo, pricing y logística con resultados medibles.'
  /** A draft over two pages: three roles of fourteen bullets, each citing its own evidence. */
  function longDraft() {
    return {
      ...emptyContent,
      header: { title: 'Engineer' },
      experience: [0, 1, 2].map((r) => ({
        experienceId: `exp_${r}`,
        title: 'Engineer',
        company: `Empresa ${r}`,
        startDate: '2020-01',
        bullets: Array.from({ length: 14 }, (_, i) => ({
          id: `b${r}_${i}`,
          text: `${longText} (${r}.${i})`,
          citedEvidenceIds: [`ev_${r}_${i}`],
          keywordsUsed: [],
        })),
      })),
    }
  }
  const args = {
    // The roles longDraft writes for: a role not on file is dropped.
    profile: {
      ...profile,
      experience: [0, 1, 2].map((r) => ({
        id: `exp_${r}`,
        title: 'Engineer',
        company: `Empresa ${r}`,
        period: { start: '2020-01' },
        summary: '',
      })),
    },
    evidence: [],
    language: 'es-MX' as const,
    market: 'mx' as const,
    company: 'Acme',
    jobTitle: 'Engineer',
  }

  it('states what goes where: summary, bullets per recent role, skills rows', async () => {
    callStructuredMock.mockResolvedValue(emptyContent)
    for (const market of ['mx', 'eu-remote', 'us-remote'] as const) {
      await composeCv({ ...args, requirements, mappings: [], market })
    }
    const calls = callStructuredMock.mock.calls.map((c) => JSON.stringify(c[0]))
    for (const call of calls) {
      expect(call).toContain('≤ 450 characters')
      expect(call).toContain('≤ 200 characters')
      expect(call).toContain('at most 4 categories with at most 8 items each')
    }
    for (const call of calls.slice(0, 2)) {
      expect(call).toContain(
        'up to 12–14 experience bullets — only as many as the evidence supports — most on the three most recent roles',
      )
    }
    // The ambiguous rule that read as a 12–14-item skills section is gone.
    expect(calls[0]).not.toContain('full skills section that is about 12–14 bullets')
    // No quota: the count is a ceiling, never a number to reach.
    expect(calls[0]).not.toContain('12–14 experience bullets in total')
    expect(calls[2]).toContain('Bias hard toward a single page')
  })

  it('a tailored CV keeps the bullets that answer the posting when it cuts', async () => {
    callStructuredMock.mockResolvedValue(longDraft())
    // Only the oldest role's last bullet answers a requirement.
    const cv = await composeCv({
      ...args,
      requirements,
      mappings: [
        { requirementId: 'req_1', evidenceIds: ['ev_2_13'], strength: 'strong', rationale: '' },
      ],
    })
    const kept = cv.experience.flatMap((r) => r.bullets.map((b) => b.id))
    expect(kept.length).toBeLessThan(42)
    expect(kept).toContain('b2_13')
  })

  it('a CV that will be translated is composed with headroom for the longer language', async () => {
    callStructuredMock.mockResolvedValue(longDraft())
    const plain = await composeCv({ ...args, requirements: [], mappings: [] })
    callStructuredMock.mockResolvedValue(longDraft())
    const translatable = await composeCv({
      ...args,
      requirements: [],
      mappings: [],
      willTranslate: true,
    })
    expect(estimatePages(plain)).toBeGreaterThan(2 - 0.15)
    expect(estimatePages(translatable)).toBeLessThanOrEqual(2 - 0.15)
  })
})

describe('bulletRelevance', () => {
  it('weighs a mandatory requirement 1.5× on top of strong 2×', async () => {
    const { bulletRelevance } = await import('@/lib/ai/stages/compose-cv')
    const reqs: Requirement[] = [
      { ...requirements[0], id: 'm', mandatory: true, weight: 2 },
      { ...requirements[0], id: 'd', mandatory: false, weight: 2 },
    ]
    const score = bulletRelevance(reqs, [
      { requirementId: 'm', evidenceIds: ['ev_m'], strength: 'strong', rationale: '' },
      { requirementId: 'd', evidenceIds: ['ev_d'], strength: 'partial', rationale: '' },
    ])
    const b = (id: string) => ({ id: 'b', text: 't', citedEvidenceIds: [id], keywordsUsed: [] })
    expect(score(b('ev_m'))).toBe(2 * 2 * 1.5)
    expect(score(b('ev_d'))).toBe(2)
    expect(score(b('ev_x'))).toBe(0)
  })
})

describe('mandatoryEvidence', () => {
  it('lists the strong/partial evidence of each mandatory requirement only', async () => {
    const { mandatoryEvidence } = await import('@/lib/ai/stages/compose-cv')
    const reqs: Requirement[] = [
      { ...requirements[0], id: 'm', mandatory: true },
      { ...requirements[0], id: 'g', mandatory: true },
      { ...requirements[0], id: 'd', mandatory: false },
    ]
    expect(
      mandatoryEvidence(reqs, [
        { requirementId: 'm', evidenceIds: ['ev_1', 'ev_2'], strength: 'partial', rationale: '' },
        { requirementId: 'g', evidenceIds: ['ev_3'], strength: 'none', rationale: '' },
        { requirementId: 'd', evidenceIds: ['ev_4'], strength: 'strong', rationale: '' },
      ]),
    ).toEqual([['ev_1', 'ev_2']])
  })
})
