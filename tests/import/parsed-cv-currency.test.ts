import { describe, expect, it } from 'vitest'
import { type CvSkeleton, toParsedCV } from '@/lib/schemas'

const skeleton: CvSkeleton = {
  basics: {
    fullName: 'Test Person',
    headline: '',
    email: '',
    location: '',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Manager',
      company: 'Alpha',
      period: { start: '2020-01' },
      summary: '',
    },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  evidence: [
    {
      id: 'ev_1',
      kind: 'achievement',
      sourceRef: { type: 'experience', id: 'exp_1' },
      text: 'Manejé un presupuesto mensual de 450 mil MXN.',
      metrics: [{ raw: '450 mil MXN', value: 450_000, unit: 'MXN' }],
      tags: [],
      period: { start: '2020-01' },
      strength: 'core',
    },
  ],
}

describe('toParsedCV', () => {
  it('derives the currency a currency-named unit implies before anything downstream reads it', () => {
    const parsed = toParsedCV(skeleton).parsed
    expect(parsed.evidence[0].metrics[0].currency).toBe('MXN')
  })
})
