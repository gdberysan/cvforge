import { describe, expect, it } from 'vitest'
import { applyCvPatch, editedLineIds } from '@/lib/ai/edit-cv'
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
})
