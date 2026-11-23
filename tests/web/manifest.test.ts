import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fingerprintOf, hashTree } from '@/scripts/web-manifest'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the web build receipt', () => {
  it('hashes every served file by its posix path and leaves itself out', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'receipt-'))
    mkdirSync(path.join(dir, 'worker'))
    writeFileSync(path.join(dir, 'index.html'), 'hola')
    writeFileSync(path.join(dir, 'worker', 'w.js'), 'x')
    writeFileSync(path.join(dir, 'build.json'), '{}')
    const files = hashTree(dir)
    expect(Object.keys(files)).toEqual(['index.html', 'worker/w.js'])
    expect(files['index.html']).toMatch(/^[0-9a-f]{64}$/)
  })

  it('one changed byte anywhere changes the fingerprint', () => {
    const a = { 'index.html': 'aa', 'worker/w.js': 'bb' }
    expect(fingerprintOf(a)).toBe(fingerprintOf({ 'worker/w.js': 'bb', 'index.html': 'aa' }))
    expect(fingerprintOf(a)).not.toBe(fingerprintOf({ ...a, 'worker/w.js': 'bc' }))
  })
})
