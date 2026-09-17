import { describe, expect, it } from 'vitest'
import type { CVContent, EvidenceItem, MasterProfile } from '@/lib/schemas'
import { GeneratedBulletSchema } from '@/lib/schemas'
import { runDeterministicChecks } from '@/lib/verify/checks'

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
      period: { start: '2016-01', end: '2018-06' },
      summary: '',
    },
  ],
  education: [],
  skills: [{ category: 'Languages', items: ['TypeScript'] }],
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
    metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
    tags: ['ecommerce'],
    period: { start: '2016-01', end: '2018-06' },
    strength: 'core',
    origin: 'manual',
  },
]

function cv(bullets: CVContent['experience'][number]['bullets']): CVContent {
  return {
    header: { fullName: 'Alex', title: 'Engineer', contactLines: [] },
    summary: '',
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Engineer',
        company: 'Tiendamax',
        startDate: '2016-01',
        endDate: '2018-06',
        bullets,
      },
    ],
    education: [],
    skills: [],
    extras: [],
  }
}

const selected = new Set(['ev_1'])

describe('runDeterministicChecks', () => {
  it('passes a bullet whose citation and number both check out', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Cut checkout abandonment 18%',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.passed).toBe(true)
    expect(report.unverifiedNumbers).toEqual([])
  })

  it('flags a citation to an evidence id that does not exist', () => {
    const report = runDeterministicChecks({
      cv: cv([{ id: 'b1', text: 'Did a thing', citedEvidenceIds: ['ev_GHOST'], keywordsUsed: [] }]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.passed).toBe(false)
    expect(report.invalidCitations[0]).toMatchObject({ bulletId: 'b1', evidenceId: 'ev_GHOST' })
  })

  it('flags a citation to evidence that exists but was NOT selected', () => {
    const report = runDeterministicChecks({
      cv: cv([{ id: 'b1', text: 'Did a thing', citedEvidenceIds: ['ev_1'], keywordsUsed: [] }]),
      evidence,
      profile,
      selectedEvidenceIds: new Set<string>(),
    })
    expect(report.passed).toBe(false)
    expect(report.invalidCitations).toHaveLength(1)
  })

  it('flags an invented number — the most damaging fabrication', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Cut checkout abandonment 45%',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers[0]).toMatchObject({ bulletId: 'b1', token: '45%' })
  })

  it('flags a currency swap even when the digits match', () => {
    const pesoEvidence: EvidenceItem[] = [
      {
        ...evidence[0],
        metrics: [{ raw: '1.2M MXN in GMV', value: 1_200_000, unit: 'MXN', currency: 'MXN' }],
      },
    ]
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Drove 1.2M USD in GMV', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence: pesoEvidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers).toHaveLength(1)
  })

  it('flags an entity that appears nowhere in the profile', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Migrated the platform to Kubernetes',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
      postingVocabulary: new Set<string>(),
    })
    expect(report.unknownEntities.some((e) => e.entity.toLowerCase() === 'kubernetes')).toBe(true)
  })

  it('does not flag an entity that the posting itself introduced', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Migrated the platform to Kubernetes',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
      postingVocabulary: new Set(['kubernetes']),
    })
    expect(report.unknownEntities).toHaveLength(0)
  })

  it('fails a bullet that claims a requirement the analysis marked as a gap', () => {
    // The posting demands Kubernetes; nothing in the evidence maps to it. The
    // posting vocabulary would normally excuse the entity — a known gap must not.
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Migrated the platform to Kubernetes',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
      postingVocabulary: new Set(['kubernetes']),
      knownGaps: new Map([['kubernetes', '5+ years administering Kubernetes clusters']]),
    })
    expect(report.passed).toBe(false)
    expect(report.claimedGaps).toEqual([
      {
        bulletId: 'b1',
        keyword: 'kubernetes',
        requirementText: '5+ years administering Kubernetes clusters',
      },
    ])
  })

  it('matches a gap keyword case-insensitively and as a whole word', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Ran GOOGLE ADS campaigns',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
        { id: 'b2', text: 'Built a SQLite cache', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
      knownGaps: new Map([
        ['google ads', 'Hands-on Google Ads campaign management'],
        ['sql', 'Advanced SQL query optimization'],
      ]),
    })
    // "SQLite" contains "sql" but is not a claim of SQL.
    expect(report.claimedGaps).toEqual([
      {
        bulletId: 'b1',
        keyword: 'google ads',
        requirementText: 'Hands-on Google Ads campaign management',
      },
    ])
  })

  it('unknown entities alone are a soft signal and do not fail the report', () => {
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Worked with Acme Corp', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
      postingVocabulary: new Set<string>(),
    })
    expect(report.unknownEntities.length).toBeGreaterThan(0)
    expect(report.passed).toBe(true)
  })
})

describe('fabricated numbers that are substrings of real metrics', () => {
  const moneyEvidence: EvidenceItem[] = [
    {
      id: 'ev_1',
      kind: 'achievement',
      sourceRef: { type: 'experience', id: 'exp_1' },
      text: 'Cut cloud spend by $180k',
      metrics: [{ raw: '$180k', value: 180000, currency: 'USD', direction: 'down' }],
      tags: [],
      period: { start: '2016-01', end: '2018-06' },
      strength: 'core',
      origin: 'manual',
    },
  ]

  it('flags an invented figure even when it is a digit-substring of a recorded one', () => {
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Cut spend by $80k', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence: moneyEvidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toHaveLength(1)
    expect(report.passed).toBe(false)
  })

  it('flags 112% against a recorded 12%', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Improved conversion 112%',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [{ raw: 'improved conversion 12%', value: 12, unit: '%' }],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toHaveLength(1)
  })

  it('still accepts the real figure when the metric raw carries prose around it', () => {
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Raised ROAS 3.4x', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [{ raw: 'subí ROAS 3.4x', value: 3.4, unit: 'x', direction: 'up' }],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('accepts a Spanish decimal-comma figure against its dot-notation metric', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Gestioné 1,5M MXN mensuales',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [{ raw: '1.5M MXN', value: 1500000, currency: 'MXN' }],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toEqual([])
  })

  it('reads "mil" as a thousand — a $12 mil budget does not verify a $12M claim', () => {
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Managed a $12M budget', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [{ raw: '$12 mil MXN', value: 12000, unit: 'MXN', currency: 'MXN' }],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toHaveLength(1)
  })

  it('accepts a recorded figure written in a different magnitude notation', () => {
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Handled 1.2M MXN monthly',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [
            { raw: '1200000 MXN monthly GMV', value: 1200000, unit: 'MXN', currency: 'MXN' },
          ],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toEqual([])
  })

  it('accepts the currency-explicit form of a symbol-only metric', () => {
    // The editor stores "$1.2M" with a currency and no unit; the composer is
    // invited to write the code out. That honest form used to be flagged.
    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Handled 1.2M MXN monthly',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ]),
      evidence: [
        { ...moneyEvidence[0], metrics: [{ raw: '$1.2M', value: 1200000, currency: 'MXN' }] },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toEqual([])
  })

  it('catches an invented figure spelled with a currency code before the number', () => {
    const report = runDeterministicChecks({
      cv: cv([
        { id: 'b1', text: 'Drove USD 5M in GMV', citedEvidenceIds: ['ev_1'], keywordsUsed: [] },
      ]),
      evidence: [
        {
          ...moneyEvidence[0],
          metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%' }],
        },
      ],
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.unverifiedNumbers).toHaveLength(1)
  })
})

describe('uncited bullets reach the report', () => {
  it('admits an uncited bullet at the schema and flags it here, where repair can see it', () => {
    // GeneratedBulletSchema used to put min(1) on citedEvidenceIds. The
    // grammar cannot carry minItems, so that never prevented an uncited
    // bullet at generation — it only converted one into a fatal
    // invalid-output at parse, which made this branch (and compose's
    // purpose-built "every bullet must cite" repair instruction) unreachable.
    // The schema now admits the case so the graceful path is the real one.
    const parsed = GeneratedBulletSchema.safeParse({
      id: 'b1',
      text: 'Improved everything across the board',
      citedEvidenceIds: [],
      keywordsUsed: [],
    })
    expect(parsed.success).toBe(true)

    const report = runDeterministicChecks({
      cv: cv([
        {
          id: 'b1',
          text: 'Improved everything across the board',
          citedEvidenceIds: [],
          keywordsUsed: [],
        },
      ]),
      evidence,
      profile,
      selectedEvidenceIds: selected,
    })
    expect(report.uncitedBullets).toEqual(['b1'])
    expect(report.passed).toBe(false)
  })
})
