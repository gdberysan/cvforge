import { describe, expect, it } from 'vitest'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { runCompanionChecks } from '@/lib/verify/companion'

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
    metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
    tags: [],
    period: { start: '2016-01', end: '2018-06' },
    strength: 'core',
    origin: 'manual',
  },
]

const selected = new Set(['ev_1'])

function check(paragraphs: { id: string; text: string; citedEvidenceIds: string[] }[]) {
  return runCompanionChecks({ paragraphs, evidence, profile, selectedEvidenceIds: selected })
}

describe('runCompanionChecks', () => {
  it('passes an uncited paragraph that makes no numeric claim — rhetoric is allowed', () => {
    const report = check([
      {
        id: 'p1',
        text: 'I have followed Acme for years and admire the work.',
        citedEvidenceIds: [],
      },
    ])
    expect(report.passed).toBe(true)
    expect(report.uncitedBullets).toEqual([])
  })

  it('fails a number in an uncited paragraph — rhetoric cannot smuggle figures', () => {
    const report = check([
      { id: 'p1', text: 'I typically improve conversion by 40%.', citedEvidenceIds: [] },
    ])
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers[0]).toMatchObject({ bulletId: 'p1', token: '40%' })
  })

  it('passes a cited paragraph whose number checks out', () => {
    const report = check([
      {
        id: 'p1',
        text: 'At Tiendamax I cut checkout abandonment 18%.',
        citedEvidenceIds: ['ev_1'],
      },
    ])
    expect(report.passed).toBe(true)
  })

  it('fails a citation outside the selected set', () => {
    const report = check([{ id: 'p1', text: 'I did a thing.', citedEvidenceIds: ['ev_GHOST'] }])
    expect(report.passed).toBe(false)
    expect(report.invalidCitations).toHaveLength(1)
  })

  it('fails a cited paragraph whose number is not in the cited metrics', () => {
    const report = check([
      { id: 'p1', text: 'At Tiendamax I cut abandonment 45%.', citedEvidenceIds: ['ev_1'] },
    ])
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers[0]).toMatchObject({ bulletId: 'p1', token: '45%' })
  })
})
