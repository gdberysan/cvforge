import { describe, expect, it } from 'vitest'
import { type CvRun, cvMetrics, regressions } from '@/lib/evals/cv'
import type { CVContent, GroundingReport, MasterProfile } from '@/lib/schemas'

const cv = (summary: string, bullets: string[]): CVContent =>
  ({
    header: { fullName: 'Ana Ruiz', title: 'Paid Media Lead', contactLines: [] },
    summary,
    summaryCitedEvidenceIds: [],
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Paid Media Lead',
        company: 'Acme',
        location: '',
        startDate: '2021-03',
        endDate: null,
        bullets: bullets.map((text, i) => ({ id: `b${i}`, text, citedEvidenceIds: ['ev_1'] })),
      },
    ],
    projects: [],
    education: [],
    skills: [{ category: 'Tools', items: ['Google Ads'] }],
    extras: [],
  }) as unknown as CVContent

const clean: GroundingReport = {
  uncitedBullets: [],
  invalidCitations: [],
  unverifiedNumbers: [],
  unknownEntities: [],
  distortions: [],
  claimedGaps: [],
  unsupportedClaims: [],
  passed: true,
}

const profile = {
  experience: [{ title: 'Paid Media Lead', company: 'Acme' }],
} as unknown as MasterProfile

const requirement = (id: string, keyword: string, mandatory = true, kind = 'hard') => ({
  id,
  keyword,
  variants: [],
  mandatory,
  kind,
  text: keyword,
})

const application = {
  jobTitle: 'Paid Media Lead',
  requirements: [
    requirement('r1', 'Google Ads'),
    requirement('r2', 'Meta Ads'),
    requirement('r3', 'Kubernetes'),
    requirement('r4', 'Leadership', true, 'soft'),
  ],
  mappings: [
    { requirementId: 'r1', strength: 'strong', evidenceIds: ['ev_1'] },
    { requirementId: 'r2', strength: 'strong', evidenceIds: ['ev_1'] },
    { requirementId: 'r3', strength: 'none', evidenceIds: [] },
  ],
} as never

describe('cvMetrics', () => {
  it('counts only supported hard must-haves for coverage, and names what was left out', () => {
    const m = cvMetrics({
      cv: cv('Paid Media Lead with seven years in search.', [
        'Cut CPA 18% on Google Ads',
        'Ran the team',
      ]),
      report: clean,
      profile,
      application,
    })
    // Kubernetes is unsupported and Leadership soft: neither counts.
    expect([m.supported, m.covered, m.missing]).toEqual([2, 1, ['Meta Ads']])
    expect(m.coverage).toBe(0.5)
    expect(m.figureShare).toBe(0.5)
    expect(m.heldTitle).toBe(true)
    expect(m.flags).toBe(0)
  })

  it('counts every flag the pipeline still ships', () => {
    const m = cvMetrics({
      cv: cv('Strategist.', ['x']),
      report: {
        ...clean,
        unverifiedNumbers: [{ bulletId: 'b0', token: '40%' }],
        distortions: [{ bulletId: 'b0', reason: 'overstates scope' }],
        passed: false,
      },
      profile,
      application,
    })
    expect(m.flags).toBe(2)
    expect(m.heldTitle).toBe(false)
  })
})

describe('regressions', () => {
  const base = {
    flags: 0,
    coverage: 0.9,
    heldTitle: true,
    pages: 1.6,
  } as CvRun
  it('reads more flags, a real coverage drop, a lost held title and a longer CV as worse', () => {
    expect(regressions(base, { ...base, coverage: 0.85 })).toEqual([])
    expect(
      regressions(base, { ...base, flags: 1, coverage: 0.7, heldTitle: false, pages: 2.4 }),
    ).toHaveLength(4)
    expect(regressions(undefined, base)).toEqual([])
  })
})
