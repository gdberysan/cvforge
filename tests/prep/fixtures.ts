import type { PrepInput } from '@/lib/prep/context'
import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'

export const profile: MasterProfile = {
  basics: {
    fullName: 'Dana Pérez',
    headline: '',
    email: 'dana@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Marketplace Coordinator',
      company: 'Shopco',
      period: { start: '2019-01', end: '2021-06' },
      summary: '',
    },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [
    {
      id: 'prj_1',
      name: 'Bid Tool',
      description: 'A bidding script',
      stack: ['Python'],
      period: { start: '2025-01', end: '2025-03' },
    },
  ],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-10-01T00:00:00.000Z',
} as MasterProfile

const ev = (id: string, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id,
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: `record ${id}`,
  metrics: [],
  tags: [],
  period: { start: '2019-01', end: '2021-06' },
  strength: 'supporting',
  origin: 'manual',
  ...over,
})

export const funnel = ev('ev_funnel', {
  text: 'Automaticé el embudo de registro y la conversión quedó estable en 45%',
  metrics: [{ raw: '60%', value: 60, unit: '%' }],
  strength: 'core',
})
export const bidTool = ev('ev_bid', {
  kind: 'project-highlight',
  sourceRef: { type: 'project', id: 'prj_1' },
  text: 'Wrote a script that adjusted bids nightly',
})

export const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'Marketplace analytics',
    keyword: 'analytics',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 3,
  },
  {
    id: 'req_2',
    text: 'SQL',
    keyword: 'SQL',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
  },
  {
    id: 'req_3',
    text: 'Teamwork',
    keyword: 'teamwork',
    variants: [],
    kind: 'soft',
    mandatory: false,
    weight: 1,
  },
]
export const mappings: EvidenceMapping[] = [
  { requirementId: 'req_1', evidenceIds: ['ev_funnel'], strength: 'strong', rationale: '' },
  { requirementId: 'req_2', evidenceIds: [], strength: 'none', rationale: '' },
] as EvidenceMapping[]

export const cv = (title: string): CVContent => ({
  header: { fullName: 'Dana Pérez', title, contactLines: [] },
  summary: '',
  summaryCitedEvidenceIds: [],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Marketplace Coordinator',
      company: 'Shopco',
      startDate: '2019-01',
      endDate: '2021-06',
      bullets: [
        {
          id: 'b1',
          text: 'Automated the signup flow to a steady 45% conversion',
          citedEvidenceIds: ['ev_funnel'],
          keywordsUsed: [],
        },
      ],
    },
  ],
  projects: [],
  education: [],
  skills: [],
  extras: [],
})

/** A whole input; tests override what they are about. */
export function input(over: Partial<PrepInput> = {}): PrepInput {
  return {
    application: {
      id: 'app_1',
      company: 'Acme',
      jobTitle: 'Growth Lead',
      documentLanguage: 'en',
      requirements,
      mappings,
      documents: { cv: cv('Growth Lead') },
      groundingReport: null,
      outcomes: [],
    },
    profile,
    evidence: [funnel, bidTool],
    people: [],
    answers: [],
    ...over,
  }
}
