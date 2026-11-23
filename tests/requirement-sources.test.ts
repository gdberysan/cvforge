import { describe, expect, it } from 'vitest'
import { resolveSources } from '@/lib/requirement-sources'
import { type EvidenceItem, MasterProfileSchema } from '@/lib/schemas'

const profile = MasterProfileSchema.parse({
  basics: { fullName: 'Ana Torres', email: '' },
  experience: [
    { id: 'exp_1', title: 'PPC Lead', company: 'Kavak', period: { start: '2021-03' }, summary: '' },
  ],
  languages: [{ language: 'Inglés', level: 'C1' }],
  certifications: [{ id: 'cert_1', name: 'Amazon Ads Certified', issuer: 'Amazon' }],
  preferences: { targetTitles: [], markets: [] },
  updatedAt: '2026-08-09T00:00:00.000Z',
})
const evidence = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Bajé el ACoS de 38% a 22%.',
    metrics: [],
    tags: [],
    period: { start: '2022-01' },
    strength: 'core',
    origin: 'import',
  },
] as unknown as EvidenceItem[]

describe('resolveSources', () => {
  it('resolves an evidence record to its text and source label', () => {
    expect(resolveSources(['ev_1'], profile, evidence)).toEqual([
      { id: 'ev_1', text: 'Bajé el ACoS de 38% a 22%.', label: 'Kavak' },
    ])
  })
  it('resolves a language citation instead of calling it gone', () => {
    expect(resolveSources(['lang_ingles'], profile, evidence)).toEqual([
      { id: 'lang_ingles', text: 'Inglés — C1', label: '' },
    ])
  })
  it('resolves a certification citation', () => {
    expect(resolveSources(['cert_1'], profile, evidence)[0].text).toBe(
      'Amazon Ads Certified — Amazon',
    )
  })
  it('marks only an id found nowhere as gone', () => {
    expect(resolveSources(['ev_deleted'], profile, evidence)).toEqual([
      { id: 'ev_deleted', text: null, label: '' },
    ])
  })
})
