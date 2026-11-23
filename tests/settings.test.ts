import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearApiKey,
  hasCredentials,
  readSettings,
  settingsPath,
  writeSettings,
} from '@/lib/settings'

let dir: string
const savedEnv = { ...process.env }

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-settings-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'nested', 'config.json')
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  process.env = { ...savedEnv }
})

describe('settings', () => {
  it('reads an empty object when there is no file', () => {
    expect(readSettings()).toEqual({})
    expect(hasCredentials()).toBe(false)
  })

  it('writes the key to the configured path with mode 0600, creating directories', () => {
    writeSettings({ anthropicApiKey: 'sk-ant-test-123' })
    expect(readSettings()).toEqual({ anthropicApiKey: 'sk-ant-test-123' })
    expect(statSync(settingsPath()).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual({
      anthropicApiKey: 'sk-ant-test-123',
    })
    expect(hasCredentials()).toBe(true)
  })

  it('clearing the key leaves a valid file without it', () => {
    writeSettings({ anthropicApiKey: 'sk-ant-test-123' })
    clearApiKey()
    expect(readSettings()).toEqual({})
    expect(hasCredentials()).toBe(false)
  })

  it('an env key counts as credentials even with no file', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env'
    expect(hasCredentials()).toBe(true)
  })

  it('defaults the path next to the database', () => {
    delete process.env.CVFORGE_CONFIG_PATH
    process.env.CVFORGE_DB_PATH = '/tmp/somewhere/cvforge.db'
    expect(settingsPath()).toBe(path.join('/tmp/somewhere', 'config.json'))
  })

  it('tolerates a corrupt file', () => {
    writeSettings({})
    writeFileSync(settingsPath(), '{not json')
    expect(readSettings()).toEqual({})
  })

  it('saving over a damaged file keeps the damaged one aside instead of losing the key', () => {
    writeSettings({})
    writeFileSync(settingsPath(), '{"anthropicApiKey": "sk-ant-kept", trunc')
    writeSettings({ ...readSettings(), updateCheck: true })
    const folder = path.dirname(settingsPath())
    const damaged = readdirSync(folder).find((f) => f.startsWith('config.json.damaged-'))
    expect(damaged).toBeDefined()
    expect(readFileSync(path.join(folder, damaged as string), 'utf8')).toContain('sk-ant-kept')
    expect(readSettings()).toEqual({ updateCheck: true })
    expect(readdirSync(folder).some((f) => f.includes('.tmp-'))).toBe(false)
  })
})

describe('push quiet hours setting', () => {
  it('round-trips valid hours', () => {
    writeSettings({ pushQuietHours: { start: 23, end: 7 } })
    expect(readSettings().pushQuietHours).toEqual({ start: 23, end: 7 })
  })

  it('ignores hours outside 0–23 or not whole', () => {
    writeSettings({})
    writeFileSync(settingsPath(), JSON.stringify({ pushQuietHours: { start: 25, end: 7 } }))
    expect(readSettings().pushQuietHours).toBeUndefined()
    writeFileSync(settingsPath(), JSON.stringify({ pushQuietHours: { start: 1.5, end: 7 } }))
    expect(readSettings().pushQuietHours).toBeUndefined()
  })
})

describe('kit settings', () => {
  it('read kitOnChase and a kitDailyCap within 1–10, and default otherwise', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const { kitDailyCap, kitOnChase, readSettings } = await import('@/lib/settings')
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-kitset-'))
    const prev = process.env.CVFORGE_CONFIG_PATH
    process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
    try {
      expect(kitOnChase()).toBe(true)
      expect(kitDailyCap()).toBe(5)
      writeFileSync(
        process.env.CVFORGE_CONFIG_PATH,
        JSON.stringify({ kitOnChase: false, kitDailyCap: 3 }),
      )
      expect(readSettings()).toMatchObject({ kitOnChase: false, kitDailyCap: 3 })
      expect(kitOnChase()).toBe(false)
      expect(kitDailyCap()).toBe(3)
      writeFileSync(
        process.env.CVFORGE_CONFIG_PATH,
        JSON.stringify({ kitOnChase: 'yes', kitDailyCap: 40 }),
      )
      expect(kitOnChase()).toBe(true)
      expect(kitDailyCap()).toBe(5)
    } finally {
      if (prev === undefined) delete process.env.CVFORGE_CONFIG_PATH
      else process.env.CVFORGE_CONFIG_PATH = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
