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

describe('toParsedCV projects', () => {
  const projectItem = (id: string, projectId: string) => ({
    id,
    kind: 'project-highlight' as const,
    sourceRef: { type: 'project' as const, id: projectId },
    text: 'Built a reporting tool',
    metrics: [],
    tags: [],
    strength: 'core' as const,
  })

  it('reads a project period and lets its undated achievements inherit it', () => {
    const { parsed } = toParsedCV({
      ...skeleton,
      projects: [
        {
          id: 'proj_1',
          name: 'Shelf Tracker',
          description: '',
          stack: [],
          period: { start: '2024' },
        },
      ],
      evidence: [projectItem('ev_p', 'proj_1')],
    })
    expect(parsed.profile.projects[0].period).toEqual({ start: '2024-01' })
    expect(parsed.evidence[0].period).toEqual({ start: '2024-01' })
  })

  it('keeps an undated project undated and reports its achievement instead of inventing a month', () => {
    const { parsed, problems } = toParsedCV({
      ...skeleton,
      projects: [{ id: 'proj_1', name: 'Side tool', description: '', stack: [] }],
      evidence: [projectItem('ev_p', 'proj_1')],
    })
    expect(parsed.profile.projects[0].period).toBeUndefined()
    expect(parsed.evidence).toEqual([])
    expect(problems).toHaveLength(1)
  })
})
