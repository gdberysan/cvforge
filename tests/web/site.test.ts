import { describe, expect, it } from 'vitest'
import {
  LEGACY_REDIRECT,
  landingPolicy,
  parseHeaders,
  underBase,
  vercelSource,
} from '@/scripts/web-site'

describe('the host rules for rumbo.korven.dev', () => {
  it('rewrite every id to the one built page, trailing slash included', () => {
    expect(vercelSource('/app/application/*/gaps/*')).toBe('/app/application/:p1/gaps/:p2(.*)')
    expect(vercelSource('/app/application/*')).toBe('/app/application/:p1(.*)')
  })

  it('move the app paths under the base and keep the catch-all', () => {
    expect(underBase('/worker/*')).toBe('/app/worker/*')
    expect(underBase('/*')).toBe('/*')
  })

  it('read Cloudflare _headers into rules', () => {
    expect(parseHeaders('/*\n  X-A: 1\n\n/sw.js\n  X-B: 2\n')).toEqual([
      ['/*', { 'X-A': '1' }],
      ['/sw.js', { 'X-B': '2' }],
    ])
  })

  it('let the landing reach nothing outside the site', () => {
    const policy = landingPolicy(['abc'])
    expect(policy).toContain("connect-src 'none'")
    expect(policy).toContain("font-src 'self'")
    expect(policy).not.toMatch(/googleapis|gstatic/)
  })

  it('send the retired address to Rumbo, except the desktop update notice', () => {
    const re = new RegExp(`^${LEGACY_REDIRECT.source}$`)
    expect(re.test('/')).toBe(true)
    expect(re.test('/pipeline')).toBe(true)
    expect(re.test('/version.json')).toBe(false)
    expect(LEGACY_REDIRECT.has).toEqual([{ type: 'host', value: 'cvforge.korven.dev' }])
  })
})
