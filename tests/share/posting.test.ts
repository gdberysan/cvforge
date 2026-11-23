import { describe, expect, it } from 'vitest'
import type { JobDetail } from '@/lib/schemas/discover'
import { postingFromDetail } from '@/lib/share/posting'

const base: JobDetail = {
  id: '4012345678',
  title: 'Growth Lead',
  company: 'Acme',
  companyUrl: null,
  location: 'Ciudad de México',
  date: null,
  url: 'https://www.linkedin.com/jobs/view/4012345678',
  description: 'Responsabilidades…',
  seniority: null,
  employmentType: null,
}

describe('postingFromDetail', () => {
  it('heads the description with title, company and location', () => {
    expect(postingFromDetail(base)).toBe(
      'Growth Lead\nAcme · Ciudad de México\n\nResponsabilidades…',
    )
  })

  it('returns an empty string when there is no description to analyse', () => {
    expect(postingFromDetail({ ...base, description: null })).toBe('')
    expect(postingFromDetail({ ...base, description: '   ' })).toBe('')
  })
})
