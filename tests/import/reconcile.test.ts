import { describe, expect, it } from 'vitest'
import { mergeImport, reconcileImport } from '@/lib/import/reconcile'
import type { EvidenceItem, Experience, MasterProfile } from '@/lib/schemas'

const base: Omit<MasterProfile, 'experience'> = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: 'Full-stack engineer',
    email: 'x@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-25T00:00:00.000Z',
}

function role(id: string, company: string, start: string, end?: string): Experience {
  return { id, title: 'Engineer', company, period: { start, ...(end ? { end } : {}) }, summary: '' }
}

function stub(id: string, roleId: string): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: roleId },
    text: 'x',
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'import',
  }
}

function parsedWith(experience: Experience[], evidence: EvidenceItem[]) {
  return { profile: { ...base, experience }, evidence }
}

describe('reconcileImport', () => {
  it('a re-imported role keeps its existing id when company and period match', () => {
    const existing = [role('exp_1', 'Tiendamax', '2016-01', '2018-06')]
    const parsed = parsedWith(
      [role('exp_1', 'Tiendamax', '2016-01', '2018-06')],
      [stub('ev_1', 'exp_1')],
    )
    const out = reconcileImport(existing, parsed)
    expect(out.profile.experience[0].id).toBe('exp_1')
    expect(out.evidence[0].sourceRef.id).toBe('exp_1')
  })

  it('a role that moved position still gets its old id, not the positional one', () => {
    // The parser numbers roles by position. A new CV with the newest job on
    // top shifts every role down one — without matching, evidence recorded
    // under exp_1 silently reattaches to the new job.
    const existing = [
      role('exp_1', 'Tiendamax', '2016-01', '2018-06'),
      role('exp_2', 'Grupo Andino', '2018-07', '2021-02'),
    ]
    const parsed = parsedWith(
      [
        role('exp_1', 'Farmacias del Valle', '2021-03'), // the new job
        role('exp_2', 'Tiendamax', '2016-01', '2018-06'),
        role('exp_3', 'Grupo Andino', '2018-07', '2021-02'),
      ],
      [stub('ev_1', 'exp_2'), stub('ev_2', 'exp_3')],
    )
    const out = reconcileImport(existing, parsed)
    const byCompany = new Map(out.profile.experience.map((r) => [r.company, r.id]))
    expect(byCompany.get('Tiendamax')).toBe('exp_1')
    expect(byCompany.get('Grupo Andino')).toBe('exp_2')
    // The unmatched new job must not squat on an id that means something else.
    expect(byCompany.get('Farmacias del Valle')).not.toBe('exp_1')
    expect(byCompany.get('Farmacias del Valle')).not.toBe('exp_2')
    // Incoming stubs follow their roles.
    expect(out.evidence.find((e) => e.id === 'ev_1')?.sourceRef.id).toBe('exp_1')
    expect(out.evidence.find((e) => e.id === 'ev_2')?.sourceRef.id).toBe('exp_2')
  })

  it('matches on normalized company names and overlapping periods', () => {
    const existing = [role('exp_1', 'Tiendamax  S.A.', '2016-01', '2018-06')]
    const parsed = parsedWith([role('exp_1', 'tiendamax s.a.', '2016-03')], [])
    const out = reconcileImport(existing, parsed)
    expect(out.profile.experience[0].id).toBe('exp_1')
  })

  it('does not match the same company with disjoint periods twice', () => {
    // Two stints at the same company are two roles; only the overlapping one
    // may inherit the id.
    const existing = [role('exp_1', 'Tiendamax', '2016-01', '2018-06')]
    const parsed = parsedWith(
      [role('exp_1', 'Tiendamax', '2016-01', '2018-06'), role('exp_2', 'Tiendamax', '2022-01')],
      [],
    )
    const out = reconcileImport(existing, parsed)
    expect(out.profile.experience[0].id).toBe('exp_1')
    expect(out.profile.experience[1].id).not.toBe('exp_1')
  })

  it('a first import passes through untouched', () => {
    const parsed = parsedWith([role('exp_1', 'Tiendamax', '2016-01')], [stub('ev_1', 'exp_1')])
    const out = reconcileImport([], parsed)
    expect(out).toEqual(parsed)
  })

  it('gives the original id to the stint with the identical start, whatever the import order', () => {
    // Backlog #7: one greedy pass let a later, merely overlapping stint take
    // the original role's id because it came first in the new CV.
    const existing = [role('exp_1', 'Bazario', '2016-01', '2019-06')]
    const parsed = parsedWith(
      [
        role('exp_1', 'Bazario', '2018-01', '2019-06'),
        role('exp_2', 'Bazario', '2016-01', '2017-12'),
      ],
      [stub('ev_later', 'exp_1'), stub('ev_original', 'exp_2')],
    )
    const out = reconcileImport(existing, parsed)
    const original = out.profile.experience.find((r) => r.period.start === '2016-01')
    const later = out.profile.experience.find((r) => r.period.start === '2018-01')
    expect(original?.id).toBe('exp_1')
    expect(later?.id).not.toBe('exp_1')
    expect(out.evidence.find((e) => e.id === 'ev_original')?.sourceRef.id).toBe('exp_1')
    expect(out.evidence.find((e) => e.id === 'ev_later')?.sourceRef.id).toBe(later?.id)
  })

  it.each([
    ['Tiendamax S.A. de C.V.', 'Tiendamax'],
    ['Tiendamax, S.A.P.I. de C.V.', 'TIENDAMAX'],
    ['Tiendamax S. de R.L. de C.V.', 'Tiendamax S.A.'],
    ['Tiendamax Inc.', 'Tiendamax, LLC'],
    ['Tiendamáx GmbH', 'Tiendamax'],
  ])('treats "%s" and "%s" as one company', (a, b) => {
    const existing = [role('exp_1', a, '2016-01', '2018-06')]
    const out = reconcileImport(existing, parsedWith([role('exp_9', b, '2016-01')], []))
    expect(out.profile.experience[0].id).toBe('exp_1')
  })

  it('never strips a name down to nothing — "Inc." alone is still a company', () => {
    const existing = [role('exp_1', 'Inc.', '2016-01', '2018-06')]
    const out = reconcileImport(existing, parsedWith([role('exp_9', 'Acme Inc.', '2016-01')], []))
    expect(out.profile.experience[0].id).not.toBe('exp_1')
  })
})

/**
 * 2026-11-19 audit: accepting a re-import replaced the whole profile, so what
 * a CV never states came back empty, hand-made projects vanished, and
 * positional ids moved kept evidence to whatever now sat at that position —
 * evidence a CV then silently dropped once its role or project was gone.
 */
describe('mergeImport', () => {
  const kept = (id: string, type: 'experience' | 'project' | 'certification', to: string) => ({
    ...stub(id, to),
    sourceRef: { type, id: to },
    origin: 'interview' as const,
  })
  const current: MasterProfile = {
    ...base,
    basics: { ...base.basics, timezone: 'America/Bogota' },
    experience: [
      role('exp_1', 'Acme', '2020-01'),
      role('exp_2', 'OldCo', '2015-01', '2017-12'),
      role('exp_3', 'Gone SA', '2012-01', '2014-12'),
    ],
    projects: [
      { id: 'proj_1', name: 'Price Tracker', description: '', stack: [] },
      { id: 'proj_2', name: 'Side Tool', description: '', stack: [] },
    ],
    certifications: [{ id: 'cert_1', name: 'Google Ads Search', issuer: 'Google' }],
    workAuthorization: [{ country: 'Colombia', status: 'Citizen' }],
    preferences: { targetTitles: ['Growth Lead'], markets: ['us-remote'] },
  }
  // The new CV: Acme kept, OldCo dropped from it, a new project first in line,
  // the old Price Tracker second, the certificate renumbered.
  const incoming = {
    profile: {
      ...base,
      experience: [role('exp_1', 'Acme', '2020-01'), role('exp_2', 'NewCo', '2018-01', '2019-12')],
      projects: [
        { id: 'proj_1', name: 'Shiny App', description: '', stack: [] },
        { id: 'proj_2', name: 'Price tracker', description: '', stack: [] },
      ],
      certifications: [
        { id: 'cert_1', name: 'Meta Blueprint', issuer: 'Meta' },
        { id: 'cert_2', name: 'Google Ads Search', issuer: 'Google' },
      ],
    },
    evidence: [
      { ...stub('ev_new', 'exp_2'), sourceRef: { type: 'project' as const, id: 'proj_1' } },
    ],
  }
  const keptEvidence = [
    kept('ev_a', 'experience', 'exp_2'),
    kept('ev_b', 'project', 'proj_1'),
    kept('ev_c', 'certification', 'cert_1'),
  ]
  const out = mergeImport(current, keptEvidence, incoming)

  it('keeps what only the person sets: work authorization, preferences, time zone', () => {
    expect(out.profile.workAuthorization).toEqual(current.workAuthorization)
    expect(out.profile.preferences).toEqual(current.preferences)
    expect(out.profile.basics.timezone).toBe('America/Bogota')
  })

  it('keeps a role the new CV leaves out when the person has evidence on it, and only then', () => {
    const companies = out.profile.experience.map((r) => r.company)
    expect(companies).toContain('OldCo')
    expect(companies).not.toContain('Gone SA')
    expect(out.profile.experience.find((r) => r.company === 'OldCo')?.id).toBe('exp_2')
    // The new role cannot take an id kept evidence already means.
    expect(out.profile.experience.find((r) => r.company === 'NewCo')?.id).not.toBe('exp_2')
  })

  it('matches projects and certificates by name, so kept evidence stays on its own', () => {
    expect(out.profile.projects.find((p) => p.name === 'Price tracker')?.id).toBe('proj_1')
    expect(out.profile.projects.find((p) => p.name === 'Shiny App')?.id).not.toBe('proj_1')
    expect(out.profile.certifications.find((c) => c.name === 'Google Ads Search')?.id).toBe(
      'cert_1',
    )
    expect(out.profile.certifications.find((c) => c.name === 'Meta Blueprint')?.id).not.toBe(
      'cert_1',
    )
    // The new CV's own evidence follows its project to the new id.
    const shiny = out.profile.projects.find((p) => p.name === 'Shiny App')?.id
    expect(out.evidence[0].sourceRef).toEqual({ type: 'project', id: shiny })
  })

  it('keeps every hand-made project the new CV does not mention', () => {
    expect(out.profile.projects.map((p) => p.name)).toContain('Side Tool')
  })
})
