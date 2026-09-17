import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
})
