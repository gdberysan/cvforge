import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { inlineHashes, pagePolicy, WORKER_POLICY, withPolicy } from '@/scripts/web-csp'

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64')

describe('the web edition’s Content-Security-Policy', () => {
  it('hashes exactly the inline scripts that execute, not data blocks or external ones', () => {
    const html = `<head></head><script>a()</script><script src="/x.js"></script><script type="application/json">{"a":1}</script><script async="">b()</script>`
    expect(inlineHashes(html).sort()).toEqual([sha('a()'), sha('b()')].sort())
  })

  it('allows only this origin and those hashes to run; no eval; nowhere else to send data', () => {
    const policy = pagePolicy(['abc'])
    expect(policy).toContain("script-src 'self' 'sha256-abc'")
    expect(policy).not.toMatch(/unsafe-eval|unsafe-inline'[^;]*script|\*/)
    expect(policy).toContain("connect-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'none'")
  })

  it('lets only the Worker reach Anthropic and compile WebAssembly', () => {
    expect(WORKER_POLICY).toContain("connect-src 'self' https://api.anthropic.com")
    expect(WORKER_POLICY).toContain("'wasm-unsafe-eval'")
    expect(WORKER_POLICY).not.toContain("'unsafe-eval'")
    expect(pagePolicy([])).not.toContain('anthropic')
  })

  it('puts the policy first in <head>, before any script can run', () => {
    const out = withPolicy('<html><head><script>x()</script></head></html>')
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<script>'))
    expect(out).toContain(`'sha256-${sha('x()')}'`)
  })
})
