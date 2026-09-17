import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const createMock = vi.fn()
const ctorArgs: unknown[] = []
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
    constructor(opts?: unknown) {
      ctorArgs.push(opts)
    }
  },
}))

// No env credentials in this file: the point is the file path.
delete process.env.ANTHROPIC_API_KEY
delete process.env.ANTHROPIC_AUTH_TOKEN
const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-client-'))
process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
const configPath = process.env.CVFORGE_CONFIG_PATH

const { callStructured, resetClient } = await import('@/lib/ai/client')
const Schema = z.object({ answer: z.string() })
const call = () =>
  callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low' })

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('client credentials', () => {
  beforeEach(() => {
    createMock.mockReset()
    createMock.mockResolvedValue({ content: [{ type: 'text', text: '{"answer":"ok"}' }] })
    ctorArgs.length = 0
    resetClient()
  })

  it('passes the file key to the SDK when the environment has none', async () => {
    writeFileSync(configPath, JSON.stringify({ anthropicApiKey: 'sk-ant-file' }))
    await call()
    expect(ctorArgs[0]).toMatchObject({ apiKey: 'sk-ant-file', maxRetries: 0 })
  })

  it('lets the SDK resolve on its own when neither env nor file has a key', async () => {
    writeFileSync(configPath, '{}')
    await call()
    expect(ctorArgs[0]).toEqual({ maxRetries: 0 })
  })

  it('prefers the environment over the file', async () => {
    writeFileSync(configPath, JSON.stringify({ anthropicApiKey: 'sk-ant-file' }))
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env'
    try {
      await call()
      // Env present → no explicit apiKey; the SDK reads the env itself.
      expect(ctorArgs[0]).toEqual({ maxRetries: 0 })
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })

  it('resetClient forces reconstruction with the new key', async () => {
    writeFileSync(configPath, JSON.stringify({ anthropicApiKey: 'sk-ant-one' }))
    await call()
    writeFileSync(configPath, JSON.stringify({ anthropicApiKey: 'sk-ant-two' }))
    await call()
    expect(ctorArgs).toHaveLength(1) // still cached
    resetClient()
    await call()
    expect(ctorArgs[1]).toMatchObject({ apiKey: 'sk-ant-two' })
  })
})

describe('usageFromError', () => {
  it('finds usage wherever the SDK hangs it on a failed call', async () => {
    const { usageFromError } = await import('@/lib/ai/client')
    const usage = { input_tokens: 100, output_tokens: 5 }
    expect(usageFromError({ usage })).toEqual(usage)
    expect(usageFromError({ response: { usage } })).toEqual(usage)
    expect(usageFromError({ error: { usage } })).toEqual(usage)
    expect(usageFromError(new Error('plain'))).toBeNull()
    expect(usageFromError({ usage: { note: 'no token fields' } })).toBeNull()
  })
})
