import { describe, expect, it } from 'vitest'
import type { ApplicationLink } from '@/lib/discover/annotate'
import { annotateCard, linkedInJobId, marketFromLocation } from '@/lib/discover/annotate'
import type { JobCard } from '@/lib/schemas/discover'

const card = (id: string): JobCard => ({
  id,
  title: 'T',
  company: null,
  companyUrl: null,
  location: null,
  date: null,
  url: `https://www.linkedin.com/jobs/view/${id}`,
})

describe('linkedInJobId', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/4300011451', '4300011451'],
    ['https://mx.linkedin.com/jobs/view/data-engineer-at-acme-4300011451?refId=a', '4300011451'],
    ['https://www.linkedin.com/jobs/view/4300011451/', '4300011451'],
    ['https://otherportal.com/jobs/view/4300011451', null], // same path shape, wrong domain — the guard's whole job
    ['https://occ.com.mx/empleo/123456789', null], // not a LinkedIn job URL
    ['https://www.linkedin.com/company/acme', null],
    ['https://fakelinkedin.com/jobs/view/4300011451', null], // substring match must not fool the guard
    ['https://evil.com/linkedin.com/jobs/view/4300011451', null], // path-embedded domain must not fool the guard
    [null, null],
  ])('%s → %s', (url, expected) => {
    expect(linkedInJobId(url)).toBe(expected)
  })
})

describe('annotateCard', () => {
  const apps: ApplicationLink[] = [
    {
      id: 'app-1',
      sourceUrl: 'https://mx.linkedin.com/jobs/view/data-engineer-at-acme-4300011451?refId=a',
      status: 'applied',
      createdAt: '2026-08-14 12:00:00',
    },
    { id: 'app-2', sourceUrl: null, status: 'triaged', createdAt: '2026-08-20 09:00:00' },
  ]

  it('matches by job id despite slugs and params, with day age', () => {
    expect(annotateCard(card('4300011451'), apps, '2026-08-26T12:00:00Z')).toEqual({
      applicationId: 'app-1',
      status: 'applied',
      daysAgo: 12,
    })
  })

  it('returns null for an unseen job', () => {
    expect(annotateCard(card('999999999'), apps, '2026-08-26T12:00:00Z')).toBeNull()
  })
})

describe('marketFromLocation', () => {
  it.each([
    ['Monterrey, Nuevo León, Mexico', ['us-remote', 'mx'], 'mx'],
    ['Ciudad de México, México', ['eu-remote'], 'mx'],
    ['Remote', ['mx', 'us-remote'], 'us-remote'],
    ['Remoto', ['mx', 'eu-remote'], 'eu-remote'],
    ['Berlin, Germany', ['mx', 'us-remote'], 'de'], // a named country is that market
    ['Berlin', ['mx', 'us-remote'], 'mx'], // a city alone → profile default
    [null, [], 'us-remote'], // nothing known → US remote, never an assumed country
  ] as const)('%s + %j → %s', (location, markets, expected) => {
    expect(marketFromLocation(location, [...markets])).toBe(expected)
  })
})
