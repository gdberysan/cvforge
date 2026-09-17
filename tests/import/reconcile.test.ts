import { describe, expect, it } from 'vitest'
import { reconcileImport } from '@/lib/import/reconcile'
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
})
