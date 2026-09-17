import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedCV } from '@/lib/schemas'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { parseCv, validateReferentialIntegrity } = await import('@/lib/ai/stages/parse-cv')
const { UndatedRoleError } = await import('@/lib/import/dates')
const {
  CvSkeletonSchema,
  CvProfileSkeletonSchema,
  CvEvidenceSkeletonSchema,
  ParsedCVSchema,
  toParsedCV,
} = await import('@/lib/schemas')

/** What the model actually emits: no origin, no updatedAt, no preferences. */
const skeleton = {
  basics: {
    fullName: 'Ana Torres',
    headline: '',
    email: '',
    phone: undefined,
    location: 'GDL',
    links: [],
  },
  summary: '',
  experience: [
    { id: 'exp_1', title: 'Engineer', company: 'Kavak', period: { start: '2021-03' }, summary: '' },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  evidence: [
    {
      id: 'ev_1',
      kind: 'achievement' as const,
      sourceRef: { type: 'experience' as const, id: 'exp_1' },
      text: 'Built the pricing pipeline',
      metrics: [],
      tags: ['python'],
      period: { start: '2021-03' },
      strength: 'core' as const,
    },
  ],
}

const base: ParsedCV = {
  profile: {
    basics: {
      fullName: 'A B',
      headline: '',
      email: 'a@b.com',
      location: '',
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
    preferences: { targetTitles: [], markets: [] },
    updatedAt: '2026-08-09T00:00:00.000Z',
  },
  evidence: [
    {
      id: 'ev_1',
      kind: 'achievement',
      sourceRef: { type: 'experience', id: 'exp_1' },
      text: 'Rebuilt checkout',
      metrics: [],
      tags: [],
      period: { start: '2016-01' },
      strength: 'core',
      origin: 'manual',
    },
  ],
}

describe('validateReferentialIntegrity', () => {
  it('accepts a parse where every evidence item points at a real source', () => {
    expect(validateReferentialIntegrity(base)).toEqual([])
  })

  it('reports evidence pointing at a non-existent experience', () => {
    const broken: ParsedCV = {
      ...base,
      evidence: [{ ...base.evidence[0], sourceRef: { type: 'experience', id: 'exp_99' } }],
    }
    const problems = validateReferentialIntegrity(broken)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('exp_99')
  })

  it('reports duplicate evidence ids', () => {
    const dupes: ParsedCV = { ...base, evidence: [base.evidence[0], base.evidence[0]] }
    expect(validateReferentialIntegrity(dupes).some((p) => p.includes('ev_1'))).toBe(true)
  })

  it('reports duplicate education and certification ids, which the model also assigns', () => {
    const dupes: ParsedCV = {
      ...base,
      profile: {
        ...base.profile,
        education: [
          { id: 'edu_1', degree: 'BA', institution: 'UNAM', period: { start: '2010-01' } },
          { id: 'edu_1', degree: 'MBA', institution: 'ITAM', period: { start: '2015-01' } },
        ],
        certifications: [
          { id: 'cert_1', name: 'GA4', issuer: '' },
          { id: 'cert_1', name: 'CRO', issuer: '' },
        ],
      },
    }
    const problems = validateReferentialIntegrity(dupes)
    expect(problems.some((p) => p.includes('education') && p.includes('edu_1'))).toBe(true)
    expect(problems.some((p) => p.includes('certification') && p.includes('cert_1'))).toBe(true)
  })

  it('reports duplicate experience ids', () => {
    const dupes: ParsedCV = {
      ...base,
      profile: {
        ...base.profile,
        experience: [base.profile.experience[0], base.profile.experience[0]],
      },
    }
    expect(validateReferentialIntegrity(dupes).some((p) => p.includes('exp_1'))).toBe(true)
  })

  it('validates project-sourced evidence against projects, not experiences', () => {
    const projectEvidence: ParsedCV = {
      ...base,
      evidence: [{ ...base.evidence[0], sourceRef: { type: 'project', id: 'exp_1' } }],
    }
    // exp_1 exists as an experience, but not as a project — this must be caught.
    expect(validateReferentialIntegrity(projectEvidence)).toHaveLength(1)
  })
})

describe('CvSkeletonSchema and toParsedCV', () => {
  it('accepts a skeleton with no email and no code-owned fields', () => {
    // The API rejected the full ParsedCV grammar as too large, and a CV
    // without an email must not force the model to invent one.
    expect(CvSkeletonSchema.safeParse(skeleton).success).toBe(true)
  })

  it('accepts links exactly as a CV writes them — schemeless included', () => {
    // "linkedin.com/in/ana" is what CVs actually print. Rejecting it at
    // accept time (while the skeleton accepted it at parse time) ate a paid
    // parse behind a generic invalid-request error.
    const withLinks = {
      ...skeleton,
      basics: {
        ...skeleton.basics,
        links: [{ label: 'LinkedIn', url: 'linkedin.com/in/anatorres' }],
      },
      certifications: [
        { id: 'cert_1', name: 'GCP Data Engineer', issuer: 'Google', url: 'cloud.google.com/cert' },
      ],
      projects: [
        { id: 'proj_1', name: 'Side thing', description: '', url: 'github.com/ana/x', stack: [] },
      ],
    }
    const parsedSkeleton = CvSkeletonSchema.safeParse(withLinks)
    expect(parsedSkeleton.success).toBe(true)
    if (parsedSkeleton.success) {
      expect(ParsedCVSchema.safeParse(toParsedCV(parsedSkeleton.data).parsed).success).toBe(true)
    }
  })

  it('accepts a certification whose issuer the CV never prints', () => {
    // A LinkedIn "Save to PDF" export lists certification names with no
    // issuing organization at all. The prompt orders absent fields left
    // empty, so the model emits "" — and a min(1) issuer turned that into
    // "the model returned an unexpected shape", killing a paid two-call
    // import. The only alternative the model has is to invent an issuer,
    // which is the fabrication this product exists to prevent.
    const linkedInExport = {
      ...skeleton,
      certifications: [
        { id: 'cert_1', name: 'Google Ads Search Certification', issuer: '' },
        { id: 'cert_2', name: 'Apple Search Ads' },
      ],
    }
    const parsedSkeleton = CvSkeletonSchema.safeParse(linkedInExport)
    expect(parsedSkeleton.success).toBe(true)
    if (parsedSkeleton.success) {
      expect(parsedSkeleton.data.certifications[1].issuer).toBe('')
      expect(ParsedCVSchema.safeParse(toParsedCV(parsedSkeleton.data).parsed).success).toBe(true)
    }
  })

  it('adapts a skeleton into a valid ParsedCV, filling what the code owns', () => {
    const parsed = toParsedCV(CvSkeletonSchema.parse(skeleton)).parsed
    expect(ParsedCVSchema.safeParse(parsed).success).toBe(true)
    expect(parsed.evidence[0].origin).toBe('import')
    expect(parsed.profile.preferences).toEqual({ targetTitles: [], markets: [] })
    expect(parsed.profile.basics.timezone).toBeTruthy()
  })
})

describe('toParsedCV dates', () => {
  const role = { id: 'exp_1', title: 'Engineer', company: 'Kavak', summary: '' }

  it('accepts an education entry and an achievement the CV gives no dates for', () => {
    // Backlog #3: every period used to demand a YYYY-MM start, so an undated
    // diploma or achievement left the model two choices — invent a month or
    // fail the ~$0.18 two-call import.
    const undated = {
      ...skeleton,
      education: [{ id: 'edu_1', degree: 'Diplomado', institution: 'ITAM' }],
      evidence: [{ ...skeleton.evidence[0], period: undefined }],
    }
    const parsedSkeleton = CvSkeletonSchema.safeParse(undated)
    expect(parsedSkeleton.success).toBe(true)
    if (!parsedSkeleton.success) return

    const { parsed, problems } = toParsedCV(parsedSkeleton.data)
    expect(ParsedCVSchema.safeParse(parsed).success).toBe(true)
    expect(parsed.profile.education[0].period).toBeUndefined()
    // The achievement happened in its role, so it takes the role's period.
    expect(parsed.evidence[0].period).toEqual({ start: '2021-03' })
    expect(problems).toEqual([])
  })

  it('reads a graduation year as an end with no invented start', () => {
    const { parsed } = toParsedCV(
      CvSkeletonSchema.parse({
        ...skeleton,
        education: [{ id: 'edu_1', degree: 'BA', institution: 'UNAM', period: { end: '2015' } }],
      }),
    )
    expect(parsed.profile.education[0].period).toEqual({ end: '2015-01' })
  })

  it('normalises the date shapes a model emits despite the prompt', () => {
    const { parsed } = toParsedCV(
      CvSkeletonSchema.parse({
        ...skeleton,
        experience: [{ ...role, period: { start: '2019', end: 'Actualidad' } }],
      }),
    )
    expect(parsed.profile.experience[0].period).toEqual({ start: '2019-01' })
  })

  it('reports and skips an achievement with no date and nowhere to inherit one', () => {
    const { parsed, problems } = toParsedCV(
      CvSkeletonSchema.parse({
        ...skeleton,
        projects: [{ id: 'proj_1', name: 'Side thing' }],
        evidence: [
          skeleton.evidence[0],
          {
            ...skeleton.evidence[0],
            id: 'ev_2',
            text: 'Shipped an open-source CLI',
            sourceRef: { type: 'project', id: 'proj_1' },
            period: undefined,
          },
        ],
      }),
    )
    expect(parsed.evidence.map((e) => e.id)).toEqual(['ev_1'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Shipped an open-source CLI')
    expect(problems[0]).toContain('Left out')
  })

  it('does not call a credential restated as an undated achievement "left out"', () => {
    // Seen on a real import: the model emits evidence for a degree that is
    // already recorded under education.
    const { problems } = toParsedCV(
      CvSkeletonSchema.parse({
        ...skeleton,
        education: [{ id: 'edu_1', degree: 'Diplomado', institution: 'ITAM' }],
        evidence: [
          {
            ...skeleton.evidence[0],
            text: 'Diplomado en Ciencia de Datos — ITAM',
            sourceRef: { type: 'education', id: 'edu_1' },
            period: undefined,
          },
        ],
      }),
    )
    expect(problems[0]).toContain('Kept as a credential')
  })

  it('refuses a role with no readable start instead of storing a made-up month', () => {
    const undatedRole = CvSkeletonSchema.parse({
      ...skeleton,
      experience: [{ ...role, period: {} }],
    })
    expect(() => toParsedCV(undatedRole)).toThrow(UndatedRoleError)
  })

  it('refuses a role whose end date it cannot read, rather than calling it ongoing', () => {
    const unreadableEnd = CvSkeletonSchema.parse({
      ...skeleton,
      experience: [{ ...role, period: { start: '2018-01', end: 'a while ago' } }],
    })
    expect(() => toParsedCV(unreadableEnd)).toThrow(UndatedRoleError)
  })
})

describe('parseCv', () => {
  beforeEach(() => {
    callStructuredMock.mockReset()
    const { evidence, ...profilePart } = CvSkeletonSchema.parse(skeleton)
    callStructuredMock.mockResolvedValueOnce(profilePart).mockResolvedValueOnce({ evidence })
  })

  it('splits parsing into two calls, so each grammar fits the API limit', async () => {
    // The combined profile+evidence grammar is rejected by the API as too
    // large; each half fits comfortably.
    await parseCv({ text: 'Ana Torres, Engineer at Kavak since 2021, built things.' })

    expect(callStructuredMock).toHaveBeenCalledTimes(2)
    expect(callStructuredMock.mock.calls[0][0].schema).toBe(CvProfileSkeletonSchema)
    expect(callStructuredMock.mock.calls[1][0].schema).toBe(CvEvidenceSkeletonSchema)
  })

  it('gives the evidence pass the ids the profile pass assigned', async () => {
    await parseCv({ text: 'Ana Torres, Engineer at Kavak since 2021, built things.' })

    const user = callStructuredMock.mock.calls[1][0].user as string
    expect(user).toContain('exp_1')
    expect(user).toContain('Kavak')
  })

  it('wraps pasted text in a cv block on both calls', async () => {
    await parseCv({ text: 'Backend Engineer at Tiendamax 2016-2018' })

    for (const call of callStructuredMock.mock.calls) {
      expect(call[0].user).toContain('<cv>')
      expect(call[0].user).toContain('Backend Engineer at Tiendamax')
    }
  })

  it('sends a PDF as a document block on both calls', async () => {
    // Option 3: the model reads the PDF natively — no text-extraction step
    // to scramble two-column layouts or drop scanned pages.
    await parseCv({ pdf: 'JVBERi0xLjQK' })

    for (const call of callStructuredMock.mock.calls) {
      const user = call[0].user
      expect(Array.isArray(user)).toBe(true)
      expect(user[0]).toEqual({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
      })
      expect(user[1].type).toBe('text')
      // The PDF is untrusted input, same as pasted text: data, not instructions.
      expect(user[1].text.toLowerCase()).toContain('data')
    }
  })

  it('reports its two real stages in order, for progress display', async () => {
    const stages: string[] = []
    await parseCv({ pdf: 'JVBERi0xLjQK' }, (stage) => stages.push(stage))
    expect(stages).toEqual(['profile', 'evidence'])
  })

  it('stops before the paid evidence call when a role has no dates', async () => {
    callStructuredMock.mockReset()
    const { evidence: _, ...profilePart } = CvSkeletonSchema.parse({
      ...skeleton,
      experience: [{ ...skeleton.experience[0], period: {} }],
    })
    callStructuredMock.mockResolvedValueOnce(profilePart)

    await expect(parseCv({ text: 'Ana Torres, Engineer at Kavak, built things.' })).rejects.toThrow(
      UndatedRoleError,
    )
    expect(callStructuredMock).toHaveBeenCalledTimes(1)
  })

  it('marks every parsed evidence item as import-origin on both paths', async () => {
    const { parsed: viaPdf } = await parseCv({ pdf: 'JVBERi0xLjQK' })
    expect(viaPdf.evidence.every((e) => e.origin === 'import')).toBe(true)
  })
})
