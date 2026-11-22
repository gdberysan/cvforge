import { describe, expect, it } from 'vitest'
import { resolveShared } from '@/lib/share/resolve'

const LONG =
  'Buscamos un Growth Marketing Manager con experiencia en Amazon Ads y Mercado Norte. '.repeat(2)

describe('resolveShared', () => {
  it('finds a LinkedIn job in the url field', () => {
    expect(
      resolveShared({ url: 'https://www.linkedin.com/jobs/view/4012345678/?trk=share' }),
    ).toEqual({
      kind: 'linkedin',
      jobId: '4012345678',
      url: 'https://www.linkedin.com/jobs/view/4012345678/',
    })
  })

  it('finds a LinkedIn job inside shared text, as the LinkedIn app sends it', () => {
    expect(
      resolveShared({
        text: 'Check out this job at Acme: https://www.linkedin.com/jobs/view/growth-lead-at-acme-4012345678',
      }),
    ).toMatchObject({ kind: 'linkedin', jobId: '4012345678' })
  })

  it('uses selected text of a posting directly, keeping a link if one came with it', () => {
    expect(resolveShared({ text: LONG, url: 'https://boards.greenhouse.io/acme/jobs/1' })).toEqual({
      kind: 'text',
      text: LONG.trim(),
      url: 'https://boards.greenhouse.io/acme/jobs/1',
    })
  })

  it('falls back to the paste box for anything else, keeping the link', () => {
    expect(resolveShared({ url: 'https://jobs.lever.co/acme/123' })).toEqual({
      kind: 'paste',
      url: 'https://jobs.lever.co/acme/123',
    })
    expect(resolveShared({ text: 'mira esto' })).toEqual({ kind: 'paste' })
    expect(resolveShared({})).toEqual({ kind: 'paste' })
    expect(resolveShared({ url: 'https://www.linkedin.com/feed/' })).toEqual({
      kind: 'paste',
      url: 'https://www.linkedin.com/feed/',
    })
    expect(resolveShared({ url: 'javascript:alert(1)' })).toEqual({ kind: 'paste' })
  })
})
