import { describe, expect, it } from 'vitest'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { computeProfileStrength, roleHealth } from '@/lib/strength'

const baseProfile: MasterProfile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: 'Full-stack engineer',
    email: 'g@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: 'Twelve years building ecommerce and automation systems.',
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
  languages: [{ language: 'Spanish', level: 'native' }],
  certifications: [],
  projects: [],
  workAuthorization: [{ country: 'MX', status: 'citizen' }],
  preferences: { targetTitles: ['Senior Engineer'], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

function ev(id: string, over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Rebuilt the checkout flow',
    metrics: [],
    tags: ['ecommerce'],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
    ...over,
  }
}

describe('computeProfileStrength', () => {
  it('scores an empty profile at zero — no points for vacuously-true rules', () => {
    // With nothing recorded, "every role has evidence" and "every achievement
    // is quantified" are true of the empty set. A gauge that starts over half
    // full with zero data is the vanity meter the design forbids.
    const empty: MasterProfile = {
      ...baseProfile,
      summary: '',
      experience: [],
      skills: [],
      preferences: { targetTitles: [], markets: ['mx'] },
    }
    expect(computeProfileStrength(empty, []).score).toBe(0)
  })

  it('withholds the metrics slice until at least one achievement exists', () => {
    // One untagged credential: no achievements on file, so the "all
    // achievements are quantified" slice must not be awarded vacuously.
    // The quantified-achievement profile earns both the metrics slice (25)
    // and the tags slice (10) that the credential-only profile does not.
    const credential = ev('ev_1', { kind: 'credential', tags: [] })
    const withOne = computeProfileStrength(baseProfile, [credential])
    const withQuantified = computeProfileStrength(baseProfile, [
      ev('ev_1', { metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%' }] }),
    ])
    expect(withQuantified.score - withOne.score).toBe(35)
  })

  it('scores the metrics slice by the share of quantified achievements', () => {
    const q = { metrics: [{ raw: '18%', value: 18, unit: '%' }] }
    const evidence = [
      ...Array.from({ length: 18 }, (_, i) => ev(`q${i}`, q)),
      ...Array.from({ length: 4 }, (_, i) => ev(`n${i}`)),
    ]
    const m = computeProfileStrength(baseProfile, evidence).categories.find(
      (c) => c.id === 'metrics',
    )
    expect(m).toMatchObject({ points: 25, got: 20, earned: false })
  })

  it('earns all of the metrics slice when every achievement is quantified, none when none is', () => {
    const q = { metrics: [{ raw: '18%', value: 18, unit: '%' }] }
    const all = computeProfileStrength(baseProfile, [ev('a', q)]).categories.find(
      (c) => c.id === 'metrics',
    )
    const none = computeProfileStrength(baseProfile, [ev('a')]).categories.find(
      (c) => c.id === 'metrics',
    )
    expect(all).toMatchObject({ got: 25, earned: true })
    expect(none).toMatchObject({ got: 0, earned: false })
  })

  it('every other slice is all or nothing, so got is its points or zero', () => {
    const { categories } = computeProfileStrength(baseProfile, [ev('a')])
    for (const c of categories.filter((c) => c.id !== 'metrics'))
      expect(c.got).toBe(c.earned ? c.points : 0)
  })

  it('flags an empty summary as a high-severity suggestion', () => {
    const { suggestions } = computeProfileStrength({ ...baseProfile, summary: '' }, [ev('ev_1')])
    expect(suggestions.some((s) => s.id === 'summary-empty' && s.severity === 'high')).toBe(true)
  })

  it('counts achievements with no metrics and carries the number', () => {
    const { suggestions } = computeProfileStrength(baseProfile, [
      ev('ev_1'),
      ev('ev_2'),
      ev('ev_3'),
    ])
    const s = suggestions.find((x) => x.id === 'metrics-missing')
    expect(s).toBeDefined()
    expect(s?.params?.n).toBe(3)
    expect(s?.countable).toBe(true)
  })

  it('does not flag metrics when every achievement is quantified', () => {
    const quantified = ev('ev_1', {
      metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
    })
    const { suggestions } = computeProfileStrength(baseProfile, [quantified])
    expect(suggestions.some((s) => s.id === 'metrics-missing')).toBe(false)
  })

  it('flags a role that has no evidence attached, and carries its name', () => {
    const twoRoles = {
      ...baseProfile,
      experience: [
        ...baseProfile.experience,
        {
          id: 'exp_2',
          title: 'Lead',
          company: 'Apuesta',
          period: { start: '2021-01' },
          summary: '',
        },
      ],
    }
    const { suggestions } = computeProfileStrength(twoRoles, [ev('ev_1')])
    const s = suggestions.find((x) => x.id === 'role-without-evidence')
    expect(s).toBeDefined()
    expect(s?.targetId).toBe('exp_2')
    expect(s?.params?.company).toBe('Apuesta')
  })

  it('does not credit a role holding only import stubs — the editor calls it empty', () => {
    // Backlog #8: the meter awarded "every role has evidence" for a role the
    // editor flagged amber as unable to carry a CV.
    const stubOnly = computeProfileStrength(baseProfile, [ev('ev_1', { origin: 'import' })])
    expect(stubOnly.categories.find((c) => c.id === 'evidencePerRole')?.earned).toBe(false)
    const s = stubOnly.suggestions.find((x) => x.id === 'role-only-stubs')
    expect(s?.targetId).toBe('exp_1')

    const expanded = computeProfileStrength(baseProfile, [
      ev('ev_1', { origin: 'import' }),
      ev('ev_2', { origin: 'interview' }),
    ])
    expect(expanded.categories.find((c) => c.id === 'evidencePerRole')?.earned).toBe(true)
  })

  it('scores a complete, quantified profile at 100 with no suggestions', () => {
    const complete = computeProfileStrength(baseProfile, [
      ev('ev_1', {
        metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
      }),
    ])
    expect(complete.score).toBe(100)
    expect(complete.suggestions).toHaveLength(0)
  })

  it('breaks the score down into the seven categories, each with its point value', () => {
    const { categories } = computeProfileStrength({ ...baseProfile, summary: '' }, [ev('ev_1')])
    expect(categories).toEqual([
      { id: 'summary', points: 15, earned: false, got: 0 },
      { id: 'experience', points: 15, earned: true, got: 15 },
      { id: 'evidencePerRole', points: 20, earned: true, got: 20 },
      { id: 'metrics', points: 25, earned: false, got: 0 },
      { id: 'tags', points: 10, earned: true, got: 10 },
      { id: 'skills', points: 10, earned: true, got: 10 },
      { id: 'targetTitles', points: 5, earned: true, got: 5 },
    ])
  })

  it('category point values sum to 100, and earned ones sum to the score', () => {
    const { score, categories } = computeProfileStrength(baseProfile, [
      ev('ev_1', {
        metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
      }),
    ])
    expect(categories.reduce((sum, c) => sum + c.points, 0)).toBe(100)
    expect(categories.filter((c) => c.earned).reduce((sum, c) => sum + c.points, 0)).toBe(score)
  })

  it('what each slice got sums to the score, including a part-earned metrics slice', () => {
    const q = { metrics: [{ raw: '18%', value: 18, unit: '%' }] }
    const { score, categories } = computeProfileStrength(baseProfile, [ev('a', q), ev('b')])
    expect(categories.reduce((sum, c) => sum + c.got, 0)).toBe(score)
  })

  it('never returns a score outside 0..100', () => {
    const empty = computeProfileStrength(
      {
        ...baseProfile,
        summary: '',
        experience: [],
        skills: [],
        preferences: { targetTitles: [], markets: [] },
      },
      [],
    )
    expect(empty.score).toBeGreaterThanOrEqual(0)
    expect(empty.score).toBeLessThanOrEqual(100)
  })
})

describe('roleHealth', () => {
  it('reads a role as unable to carry a CV when empty or import-stubs only', () => {
    const items = [
      ev('a', { origin: 'import', metrics: [] }),
      ev('b', { origin: 'import', metrics: [{ raw: '3x', value: 3, unit: 'x' }] }),
    ]
    expect(roleHealth(items, 'exp_1')).toEqual({
      recordCount: 2,
      quantified: 1,
      needsExpanding: true,
    })
    expect(roleHealth([], 'exp_1')).toEqual({
      recordCount: 0,
      quantified: 0,
      needsExpanding: true,
    })
  })

  it('one interviewed or manual record makes the role real', () => {
    const items = [ev('a', { origin: 'import' }), ev('b', { origin: 'interview' })]
    expect(roleHealth(items, 'exp_1').needsExpanding).toBe(false)
    // Records belonging to other roles never count.
    expect(roleHealth(items, 'exp_2').recordCount).toBe(0)
  })
})
