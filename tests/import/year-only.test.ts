import { describe, expect, it } from 'vitest'
import { resolveFromProfile } from '@/lib/ai/stages/compose-cv'
import { formatSpan, readPeriod } from '@/lib/import/dates'
import { periodLabel } from '@/lib/period'
import { renderPlaintext } from '@/lib/render/plaintext'
import { updateRole } from '@/lib/roles'
import type { CVContent, MasterProfile } from '@/lib/schemas'

/**
 * 2026-11-24: a CV that gave a role only as "2015 – 2019" printed "ene 2015 –
 * ene 2019": import stored the bare year as January and nothing remembered
 * it was only a year. Now the flag travels from import to every printer.
 */
describe('a date the CV gave only as a year', () => {
  it('is read as its January and remembered as a year', () => {
    expect(readPeriod({ start: '2015', end: '2019' })).toEqual({
      start: '2015-01',
      end: '2019-01',
      unreadableEnd: false,
      startYearOnly: true,
      endYearOnly: true,
    })
    expect(readPeriod({ start: 'Mar 2015', end: 'Actualidad' })).toEqual({
      start: '2015-03',
      unreadableEnd: false,
    })
  })

  it('prints as a year on the CV, on screen and in what the model reads', () => {
    const period = { start: '2015-01', end: '2019-01', startYearOnly: true, endYearOnly: true }
    expect(formatSpan(period, 'present')).toBe('2015–2019')
    expect(formatSpan({ start: '2015-01', end: '2019-06' }, 'present')).toBe('2015-01–2019-06')
    expect(periodLabel(period.start, period.end, 'es', 'actualidad', period)).toBe('2015 – 2019')

    const profile = {
      basics: {
        fullName: 'Ana',
        email: '',
        location: '',
        links: [],
        headline: '',
        timezone: 'UTC',
      },
      experience: [{ id: 'exp_1', title: 'Analista', company: 'Acme', summary: '', period }],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
      workAuthorization: [],
      skills: [],
    } as unknown as MasterProfile
    const cv = resolveFromProfile(
      {
        header: { title: 'Analista' },
        summary: 'Resumen.',
        summaryCitedEvidenceIds: [],
        experience: [{ experienceId: 'exp_1', title: 'Analista', bullets: [] }],
        projects: [],
        education: [],
        skills: [],
        extras: [],
      } as never,
      profile,
    ) as CVContent
    expect(cv.experience[0]).toMatchObject({ startYearOnly: true, endYearOnly: true })
    const text = renderPlaintext(cv, { language: 'es-MX' })
    expect(text).toContain('2015 – 2019')
    expect(text).not.toMatch(/ene\.? 2015/i)
  })

  it('stays a year while the person leaves it as it was, and not once they change it', () => {
    const profile = {
      experience: [
        {
          id: 'exp_1',
          title: 'Analista',
          company: 'Acme',
          summary: '',
          period: { start: '2015-01', end: '2019-01', startYearOnly: true, endYearOnly: true },
        },
      ],
    } as unknown as MasterProfile
    const same = updateRole(profile, 'exp_1', {
      title: 'Analista Sr',
      company: 'Acme',
      start: '2015-01',
      end: '2019-01',
    })
    expect(same?.experience[0].period).toEqual({
      start: '2015-01',
      end: '2019-01',
      startYearOnly: true,
      endYearOnly: true,
    })
    const changed = updateRole(profile, 'exp_1', {
      title: 'Analista',
      company: 'Acme',
      start: '2015-04',
      end: '2019-01',
    })
    expect(changed?.experience[0].period).toEqual({
      start: '2015-04',
      end: '2019-01',
      endYearOnly: true,
    })
  })
})
