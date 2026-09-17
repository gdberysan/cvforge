import { describe, expect, it } from 'vitest'
import { safeHttpUrl, sourceFromUrl } from '@/lib/posting-source'

describe('sourceFromUrl', () => {
  it('recognises the boards this product is actually used with', () => {
    expect(sourceFromUrl('https://www.linkedin.com/jobs/view/4231234567')).toBe('linkedin')
    expect(sourceFromUrl('https://www.occ.com.mx/empleo/oferta/12345678')).toBe('occ')
    expect(sourceFromUrl('https://mx.computrabajo.com/trabajo-de-analista')).toBe('computrabajo')
    expect(sourceFromUrl('https://mx.indeed.com/viewjob?jk=abc123')).toBe('indeed')
  })

  it('ignores subdomains and casing, which is how these URLs arrive in practice', () => {
    expect(sourceFromUrl('https://MX.LinkedIn.com/jobs/view/1')).toBe('linkedin')
    expect(sourceFromUrl('https://linkedin.com/jobs/view/1')).toBe('linkedin')
  })

  it('never matches a lookalike host that merely ends in the same letters', () => {
    // notlinkedin.com must not read as LinkedIn: a substring check would say
    // it does, and the application would record the wrong source.
    expect(sourceFromUrl('https://notlinkedin.com/jobs/view/1')).toBe('other')
    expect(sourceFromUrl('https://linkedin.com.evil.example/jobs/1')).toBe('other')
  })

  it('says "other" for an unknown host rather than guessing a company site', () => {
    expect(sourceFromUrl('https://careers.examplecorp.com/job/123')).toBe('other')
  })

  it('says "other" for anything that is not a usable URL', () => {
    expect(sourceFromUrl('not a url')).toBe('other')
    expect(sourceFromUrl('')).toBe('other')
    expect(sourceFromUrl('   ')).toBe('other')
  })

  it('accepts a bare host, because that is what pasting sometimes gives you', () => {
    expect(sourceFromUrl('www.linkedin.com/jobs/view/1')).toBe('linkedin')
  })

  it('refuses a non-http scheme, so a javascript: paste cannot become a link', () => {
    expect(sourceFromUrl('javascript:alert(1)')).toBe('other')
  })
})

describe('safeHttpUrl', () => {
  it('passes an ordinary posting link through unchanged', () => {
    expect(safeHttpUrl('https://www.linkedin.com/jobs/view/42')).toBe(
      'https://www.linkedin.com/jobs/view/42',
    )
  })

  it("refuses a javascript: URL, which the route's z.string().url() accepts", () => {
    // zod's .url() is new URL() underneath, so it says javascript:alert(1) is a
    // valid URL. Rendering that into an href would be a stored XSS in a field
    // the user pasted themselves.
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('refuses anything unparseable rather than rendering a broken link', () => {
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(undefined)).toBeNull()
  })
})
