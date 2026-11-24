import { describe, expect, it } from 'vitest'
import { applyCvPatch, editedLineIds } from '@/lib/ai/edit-cv'
import { readSkills, skillsText } from '@/lib/cv-edit-text'
import type { CVContent, MasterProfile } from '@/lib/schemas'

const cv = {
  header: { fullName: 'Ana', title: 'Paid Media Lead', contactLines: [] },
  summary: 'Paid media lead.',
  summaryCitedEvidenceIds: ['ev_1'],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Paid Media Lead',
      company: 'Acme',
      startDate: '2021-03',
      bullets: [
        { id: 'b1', text: 'Cut CPA 18%.', citedEvidenceIds: ['ev_1'] },
        { id: 'b2', text: 'Ran Google Ads.', citedEvidenceIds: ['ev_2'] },
      ],
    },
  ],
  projects: [],
  education: [],
  skills: [{ category: 'Tools', items: ['Google Ads'] }],
  extras: [],
} as unknown as CVContent

const profile = {
  experience: [{ id: 'exp_1', title: 'Paid Media Lead', company: 'Acme' }],
  certifications: [],
} as unknown as MasterProfile

describe('applyCvPatch', () => {
  it('changes words only: employers, dates, titles and citations stay as saved', () => {
    const next = applyCvPatch(cv, {
      summary: '  Paid   media lead,  seven years.  ',
      bullets: { b1: 'Cut CPA by 18% in a year.', b2: null, nope: 'ignored' },
      skills: [{ category: 'Tools', items: ['Google Ads', ' ', 'GA4'] }],
    })
    expect(next.summary).toBe('Paid media lead, seven years.')
    expect(next.experience[0]).toMatchObject({
      company: 'Acme',
      title: 'Paid Media Lead',
      startDate: '2021-03',
    })
    expect(next.experience[0]?.bullets).toEqual([
      { id: 'b1', text: 'Cut CPA by 18% in a year.', citedEvidenceIds: ['ev_1'] },
    ])
    expect(next.skills).toEqual([{ category: 'Tools', items: ['Google Ads', 'GA4'] }])
    expect(next.summaryCitedEvidenceIds).toEqual(['ev_1'])
  })

  it('an emptied bullet is removed, not saved blank', () => {
    expect(
      applyCvPatch(cv, { bullets: { b1: '   ' } }).experience[0]?.bullets.map((b) => b.id),
    ).toEqual(['b2'])
  })

  it('names exactly the lines whose words changed', () => {
    const next = applyCvPatch(cv, { bullets: { b1: 'Cut CPA by 18% in a year.', b2: null } })
    expect([...editedLineIds(cv, next, profile)].sort()).toEqual(['b1', 'b2'])
    expect([...editedLineIds(cv, applyCvPatch(cv, {}), profile)]).toEqual([])
  })

  // Both seen on saved CVs (2026-11-23): opening the editor and saving
  // untouched split a comma skill in two and cut a 688-character summary.
  const real = {
    ...cv,
    summary: `${'Paid media lead across Google, Meta and marketplaces. '.repeat(13)}End.`,
    skills: [
      {
        category: 'Paid media',
        items: ['Google Ads (Search, Shopping)', 'Marketplaces (Amazon 1P, Mercado Libre)'],
      },
    ],
  } as CVContent

  /** What the editor sends when nothing was touched. */
  const untouched = (c: CVContent) => ({
    bullets: {},
    skills: c.skills.map((s) => ({
      category: s.category,
      items: readSkills(skillsText(s.items)),
    })),
  })

  it('an untouched editor saves the CV exactly as it was, commas and long summary included', () => {
    expect(real.summary.length).toBeGreaterThan(600)
    const next = applyCvPatch(real, untouched(real))
    expect(next).toEqual(real)
    expect([...editedLineIds(real, next, profile)]).toEqual([])
  })

  it('never cuts a long line', () => {
    const long = 'x '.repeat(900).trim()
    expect(applyCvPatch(real, { summary: long }).summary).toBe(long)
    expect(applyCvPatch(real, { bullets: { b1: long } }).experience[0]?.bullets[0]?.text).toBe(long)
  })

  it('a whitespace-only difference keeps the saved line byte for byte', () => {
    const next = applyCvPatch(cv, {
      summary: ' Paid media lead. ',
      bullets: { b1: 'Cut  CPA 18%.' },
    })
    expect(next).toEqual(cv)
  })
})
