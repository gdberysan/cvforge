import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// The web edition on Rumbo's free trial: a browser, no key, a trial pass.
const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))
let settings: Record<string, unknown> = {}
vi.mock('@/lib/settings', () => ({
  readSettings: () => settings,
  writeSettings: (next: Record<string, unknown>) => {
    settings = next
  },
}))

delete process.env.ANTHROPIC_API_KEY
delete process.env.ANTHROPIC_AUTH_TOKEN
const g = globalThis as Record<string, unknown>
g.window = {}
g.self = { location: { origin: 'https://rumbo.test' } }
afterAll(() => {
  delete g.window
  delete g.self
})

const { callStructured, resetClient } = await import('@/lib/ai/client')
const { openingTokens } = await import('@/lib/ai/config')

const Schema = z.object({ answer: z.string() })
const call = (stage: string) =>
  callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low', stage })
const answer = (stop = 'end_turn') => ({
  content: [{ type: 'text', text: stop === 'max_tokens' ? '{"ans' : '{"answer":"ok"}' }],
  stop_reason: stop,
  usage: { input_tokens: 10, output_tokens: 5 },
})

describe('openingTokens', () => {
  it('opens a known stage smaller on the trial, never above the full allowance', () => {
    expect(openingTokens('compose-cv', 16_000, true)).toBe(14_000)
    expect(openingTokens('verify-distortion', 16_000, true)).toBe(6_000)
    expect(openingTokens('compose-cv', 8_000, true)).toBe(8_000)
  })

  it('leaves the full allowance with the person’s own key, and for an unlisted stage', () => {
    expect(openingTokens('compose-cv', 16_000, false)).toBe(16_000)
    expect(openingTokens('interview-prep', 21_000, true)).toBe(21_000)
    expect(openingTokens(undefined, 16_000, true)).toBe(16_000)
  })
})

describe('callStructured on the trial', () => {
  beforeEach(() => {
    createMock.mockReset()
    settings = { trialToken: 'pass' }
    resetClient()
  })

  it('asks a known stage for its opening allowance', async () => {
    createMock.mockResolvedValue(answer())
    await expect(call('compose-cv')).resolves.toEqual({ answer: 'ok' })
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][0].max_tokens).toBe(14_000)
  })

  it('asks once more with the full allowance when cut off by the opening one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    createMock.mockResolvedValueOnce(answer('max_tokens')).mockResolvedValueOnce(answer())
    await expect(call('verify-distortion')).resolves.toEqual({ answer: 'ok' })
    expect(createMock.mock.calls.map((c) => c[0].max_tokens)).toEqual([6_000, 16_000])
    error.mockRestore()
  })

  it('does not retry a cut-off at the full allowance', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    createMock.mockResolvedValue(answer('max_tokens'))
    await expect(call('interview-prep')).rejects.toMatchObject({ kind: 'invalid-output' })
    expect(createMock).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  it('keeps the full allowance once the person has a key of their own', async () => {
    settings = { anthropicApiKey: 'sk-ant-own' }
    resetClient()
    createMock.mockResolvedValue(answer())
    await call('compose-cv')
    expect(createMock.mock.calls[0][0].max_tokens).toBe(16_000)
  })

  it('names the step to the trial, and never with the person’s own key', async () => {
    createMock.mockResolvedValue(answer())
    await call('compose-cv')
    expect(createMock.mock.calls[0][1]).toEqual({ headers: { 'x-rumbo-stage': 'compose-cv' } })
    settings = { anthropicApiKey: 'sk-ant-own' }
    resetClient()
    await call('compose-cv')
    expect(createMock.mock.calls[1][1]).toBeUndefined()
  })
})
