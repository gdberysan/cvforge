import { describe, expect, it } from 'vitest'
import {
  deriveCurrency,
  EducationSchema,
  EvidenceItemSchema,
  MasterProfileSchema,
  MetricSchema,
} from '@/lib/schemas'

describe('MetricSchema', () => {
  it('accepts a currency-unit metric without an explicit currency', () => {
    // This used to be a .refine() rejection. zodOutputFormat drops refines
    // from the enforced grammar while messages.parse revalidates with the
    // full schema, so the rejection could only ever fire AFTER a paid model
    // call — killing interview structuring, gap-fill drafting, and CV import
    // whenever the model wrote unit "MXN" and skipped the redundant currency
    // field. The information was never missing: a unit that names a currency
    // IS the currency, so the caller derives it instead (deriveCurrency).
    const ok = MetricSchema.safeParse({ raw: '1.2M budget', value: 1_200_000, unit: 'MXN' })
    expect(ok.success).toBe(true)
  })

  it('accepts a currency metric with its currency set', () => {
    const ok = MetricSchema.safeParse({
      raw: 'managed a $1.2M MXN budget',
      value: 1_200_000,
      unit: 'MXN',
      currency: 'MXN',
    })
    expect(ok.success).toBe(true)
  })

  it('accepts a non-currency metric without a currency', () => {
    const ok = MetricSchema.safeParse({
      raw: 'reduced p95 latency 40%',
      value: 40,
      unit: '%',
      direction: 'down',
      subject: 'p95 latency',
    })
    expect(ok.success).toBe(true)
  })
})

describe('deriveCurrency', () => {
  const metric = (over: object) => ({ raw: 'x', ...over })

  it('fills the currency from a unit that names one', () => {
    expect(deriveCurrency(metric({ unit: 'MXN' })).currency).toBe('MXN')
  })

  it('matches the unit case-insensitively but records the canonical code', () => {
    expect(deriveCurrency(metric({ unit: 'usd' })).currency).toBe('USD')
  })

  it('never overrides a currency that was stated', () => {
    expect(deriveCurrency(metric({ unit: 'MXN', currency: 'USD' })).currency).toBe('USD')
  })

  it('leaves a non-currency unit alone', () => {
    expect(deriveCurrency(metric({ unit: 'personas' })).currency).toBeUndefined()
  })

  it('leaves a unit-less metric alone', () => {
    expect(deriveCurrency(metric({})).currency).toBeUndefined()
  })
})

describe('EducationSchema', () => {
  it('tolerates a missing degree, which a CV may legitimately omit', () => {
    // Same trap as Certification.issuer: parse-cv's shared prompt says
    // "If a field is absent, leave it empty", and min(1) made obeying that
    // instruction fatal for the whole paid two-call import. A diploma course
    // listed as just the institution and years is a real CV, not bad data.
    const parsed = EducationSchema.safeParse({
      id: 'edu_1',
      institution: 'UNAM',
      period: { start: '2010-01', end: '2014-06' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.degree).toBe('')
  })

  it('tolerates a missing institution the same way', () => {
    const parsed = EducationSchema.safeParse({
      id: 'edu_1',
      degree: 'BA International Business',
      period: { start: '2010-01', end: '2014-06' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.institution).toBe('')
  })
})

describe('MasterProfileSchema', () => {
  it('round-trips a minimal valid profile', () => {
    const profile = {
      basics: {
        fullName: 'Dana Sofía Pérez Ruiz',
        headline: 'Full-stack engineer',
        email: 'g@example.com',
        location: 'Ciudad de México',
        timezone: 'America/Mexico_City',
        links: [{ label: 'korven.dev', url: 'https://korven.dev' }],
      },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
      projects: [],
      workAuthorization: [{ country: 'MX', status: 'citizen' }],
      preferences: { targetTitles: [], markets: ['mx', 'us-remote'] },
      updatedAt: '2026-08-09T00:00:00.000Z',
    }
    const parsed = MasterProfileSchema.parse(profile)
    expect(MasterProfileSchema.parse(parsed)).toEqual(parsed)
  })

  it('rejects an unknown market', () => {
    const result = MasterProfileSchema.safeParse({ preferences: { markets: ['jp'] } })
    expect(result.success).toBe(false)
  })
})

describe('EvidenceItemSchema', () => {
  it('rejects an evidence item with empty text', () => {
    const result = EvidenceItemSchema.safeParse({
      id: 'ev_1',
      kind: 'achievement',
      sourceRef: { type: 'experience', id: 'exp_1' },
      text: '',
      metrics: [],
      tags: [],
      period: { start: '2020-01' },
      strength: 'core',
    })
    expect(result.success).toBe(false)
  })
})
