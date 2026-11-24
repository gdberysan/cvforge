import { describe, expect, it } from 'vitest'
import { withWholeHistory } from '@/lib/ai/stages/compose-cv'
import { cvText } from '@/lib/ats'
import { renderPlaintext } from '@/lib/render/plaintext'
import type { CVContent, MasterProfile } from '@/lib/schemas'

/**
 * 2026-11-24, on an S25: a 15-year CV printed its three newest roles and
 * silently dropped the two oldest. A hole in the middle gets its line back;
 * early career is named on one line, never erased.
 */
const role = (id: string, title: string, company: string, start: string, end?: string) => ({
  id,
  title,
  company,
  summary: '',
  period: { start, ...(end ? { end } : {}) },
})
const profile = {
  experience: [
    role('exp_1', 'Directora de Marketing Digital', 'Grupo Altamira', '2021-01'),
    role('exp_2', 'Gerente de Performance', 'Viajes Horizonte', '2017-03', '2020-12'),
    role('exp_3', 'Coordinadora de Medios', 'Agencia Punto Norte', '2014-06', '2017-02'),
    role('exp_4', 'Analista de Marketing', 'Seguros La Cima', '2011-08', '2014-05'),
    role('exp_5', 'Ejecutiva de Cuenta Jr.', 'Agencia Brío', '2010-01', '2011-07'),
  ],
} as unknown as MasterProfile

const entry = (
  experienceId: string,
  title: string,
  company: string,
  startDate: string,
  endDate?: string,
) => ({
  experienceId,
  title,
  company,
  startDate,
  ...(endDate ? { endDate } : {}),
  bullets: [
    {
      id: `b-${experienceId}`,
      text: 'Hice algo medible.',
      citedEvidenceIds: ['ev_1'],
      keywordsUsed: [],
    },
  ],
})

const cv = {
  header: { fullName: 'Sofía', title: '', contactLines: [] },
  summary: 'Resumen.',
  summaryCitedEvidenceIds: [],
  // The composer printed the newest and the third, skipping the second.
  experience: [
    entry('exp_1', 'Directora de Marketing Digital', 'Grupo Altamira', '2021-01'),
    entry('exp_3', 'Coordinadora de Medios', 'Agencia Punto Norte', '2014-06', '2017-02'),
  ],
  projects: [],
  education: [],
  skills: [],
  extras: [],
} as CVContent

describe('withWholeHistory', () => {
  it('brings back a role left out between two the CV prints, as a line', () => {
    const out = withWholeHistory(cv, profile)
    expect(out.experience.map((r) => r.experienceId)).toEqual(['exp_1', 'exp_2', 'exp_3'])
    expect(out.experience[1]).toMatchObject({ company: 'Viajes Horizonte', bullets: [] })
  })

  it('names the roles before the oldest printed on one line, never erased', () => {
    const out = withWholeHistory(cv, profile)
    expect(out.earlierRoles?.map((r) => r.company)).toEqual(['Seguros La Cima', 'Agencia Brío'])
    const text = renderPlaintext(out, { language: 'es-MX' })
    // The ATS check reads the same titles the paper prints.
    expect(cvText(out)).toContain('Analista de Marketing, Seguros La Cima')
    expect(text).toContain(
      'Experiencia previa: Analista de Marketing, Seguros La Cima; Ejecutiva de Cuenta Jr., Agencia Brío (2010–2014).',
    )
  })

  it('changes nothing when the CV already prints every role', () => {
    const all = {
      ...cv,
      experience: profile.experience.map((r) =>
        entry(r.id, r.title, r.company, r.period.start, r.period.end),
      ),
    }
    const out = withWholeHistory(all, profile)
    expect(out.experience).toHaveLength(5)
    expect(out.earlierRoles).toBeUndefined()
  })
})
