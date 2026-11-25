import { describe, expect, it } from 'vitest'
import {
  beaconTag,
  LEGACY_REDIRECT,
  landingPolicy,
  parseHeaders,
  underBase,
  vercelSource,
  withStore,
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

  it('let the visit counter reach only its own two Cloudflare hosts', () => {
    const policy = landingPolicy(['abc'], true)
    expect(policy).toContain('connect-src https://cloudflareinsights.com;')
    expect(policy).toMatch(
      /script-src 'sha256-abc' https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js;/,
    )
    expect(beaconTag('a'.repeat(32))).toContain(`data-cf-beacon='{"token":"${'a'.repeat(32)}"}'`)
  })

  it('send the retired address to Rumbo, except the desktop update notice', () => {
    const re = new RegExp(`^${LEGACY_REDIRECT.source}$`)
    expect(re.test('/')).toBe(true)
    expect(re.test('/pipeline')).toBe(true)
    expect(re.test('/version.json')).toBe(false)
    expect(LEGACY_REDIRECT.has).toEqual([{ type: 'host', value: 'cvforge.korven.dev' }])
  })

  it('link the extension only once the store has it', () => {
    const html = '<p>x</p><!--EXTENSION--><p class="soon">Muy pronto</p><!--/EXTENSION-->'
    expect(withStore(html, '')).toBe('<p>x</p><p class="soon">Muy pronto</p>')
    const live = withStore(html, 'https://chromewebstore.google.com/detail/rumbo/abc')
    expect(live).toContain('href="https://chromewebstore.google.com/detail/rumbo/abc"')
    expect(live).not.toContain('Muy pronto')
  })

  it('label the store button in the page language', () => {
    const html = '<!--EXTENSION--><p>Coming soon</p><!--/EXTENSION-->'
    expect(withStore(html, 'https://x', 'Add to Chrome')).toContain('>Add to Chrome</a>')
  })
})
