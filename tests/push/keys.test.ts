import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PushKeysDamaged, pushKeysPath, vapidKeys } from '@/lib/push/keys'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-push-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.CVFORGE_CONFIG_PATH
})

describe('vapidKeys', () => {
  it('generates the pair once, beside the key file, readable only by the owner', () => {
    const first = vapidKeys()
    expect(pushKeysPath()).toBe(path.join(dir, 'push.json'))
    expect(statSync(pushKeysPath()).mode & 0o777).toBe(0o600)
    expect(vapidKeys()).toEqual(first)
    expect(first.publicKey.length).toBeGreaterThan(40)
  })

  it('refuses a damaged file and leaves it exactly as it was', () => {
    writeFileSync(pushKeysPath(), '{"publicKey":"abc"', { mode: 0o600 })
    expect(() => vapidKeys()).toThrow(PushKeysDamaged)
    expect(readFileSync(pushKeysPath(), 'utf8')).toBe('{"publicKey":"abc"')
  })

  it('refuses a file missing either half of the pair', () => {
    writeFileSync(pushKeysPath(), JSON.stringify({ publicKey: 'abc' }), { mode: 0o600 })
    expect(() => vapidKeys()).toThrow(/push\.json/)
    expect(JSON.parse(readFileSync(pushKeysPath(), 'utf8'))).toEqual({ publicKey: 'abc' })
  })
})
