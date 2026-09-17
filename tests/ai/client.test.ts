import { beforeEach, describe, expect, it, vi } from 'vitest'
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

process.env.ANTHROPIC_API_KEY ??= 'sk-ant-test'

const { callStructured } = await import('@/lib/ai/client')
const { AiError } = await import('@/lib/ai/errors')

const Schema = z.object({ answer: z.string() })

/** What the API sends back: a thinking block, then the JSON as a text block. */
function reply(output: unknown, extra: Record<string, unknown> = {}) {
  return {
    content: [
      { type: 'thinking', thinking: '…' },
      { type: 'text', text: JSON.stringify(output) },
    ],
    stop_reason: 'end_turn',
    ...extra,
  }
}

describe('callStructured', () => {
  beforeEach(() => createMock.mockReset())

  it('sends the pinned model, max_tokens, and adaptive thinking', async () => {
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    await callStructured({ schema: Schema, system: [{ text: 'sys' }], user: 'hi', effort: 'low' })

    const req = createMock.mock.calls[0][0]
    expect(req.model).toBe('claude-opus-5')
    expect(req.max_tokens).toBe(16000)
    expect(req.thinking).toEqual({ type: 'adaptive' })
    expect(req.output_config.effort).toBe('low')
    expect(req.output_config.format.type).toBe('json_schema')
  })

  it('never sends sampling parameters, which 400 on claude-opus-5', async () => {
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    await callStructured({ schema: Schema, system: [{ text: 'sys' }], user: 'hi', effort: 'low' })

    const req = createMock.mock.calls[0][0]
    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
    expect(req.top_k).toBeUndefined()
  })

  it('never sends a trailing assistant message, because prefills 400', async () => {
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    await callStructured({ schema: Schema, system: [{ text: 'sys' }], user: 'hi', effort: 'low' })

    const req = createMock.mock.calls[0][0]
    expect(req.messages.at(-1).role).toBe('user')
  })

  it('applies cache_control only to system blocks marked cacheable', async () => {
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    await callStructured({
      schema: Schema,
      system: [{ text: 'stable', cache: true }, { text: 'volatile' }],
      user: 'hi',
      effort: 'high',
    })

    const [stable, volatile] = createMock.mock.calls[0][0].system
    expect(stable.cache_control).toEqual({ type: 'ephemeral' })
    expect(volatile.cache_control).toBeUndefined()
  })

  it('validates the output against the zod schema', async () => {
    createMock.mockResolvedValue(reply({ wrong: 'shape' }))
    await expect(
      callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low' }),
    ).rejects.toMatchObject({ kind: 'invalid-output' })
  })

  it('maps a 429 to a typed rate-limit AiError', async () => {
    // ...Once, not a persistent mockImplementation: a throwing implementation
    // that stays armed past the call under test gets surfaced by Vitest as a
    // test failure, masking the real assertions.
    createMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('rate limited'), { status: 429 })
    })

    // try/catch rather than `.rejects`: route handlers branch on
    // `instanceof AiError`, so the class identity is worth asserting directly.
    let caught: unknown
    try {
      await callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AiError)
    expect((caught as InstanceType<typeof AiError>).kind).toBe('rate-limit')
    expect((caught as InstanceType<typeof AiError>).userMessage).toContain('Wait about a minute')
  })

  it('retries once on a 529 overload and succeeds', async () => {
    createMock
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce(reply({ answer: 'ok' }))

    const result = await callStructured({
      schema: Schema,
      system: [{ text: 's' }],
      user: 'u',
      effort: 'low',
    })
    expect(result.answer).toBe('ok')
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('passes structured user content through unchanged, so a PDF can ride as a document block', async () => {
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    const blocks = [
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: 'JVBERi0=',
        },
      },
      { type: 'text' as const, text: 'instructions' },
    ]
    await callStructured({ schema: Schema, system: [{ text: 's' }], user: blocks, effort: 'low' })

    expect(createMock.mock.calls[0][0].messages[0].content).toEqual(blocks)
    expect(createMock.mock.calls[0][0].messages[0].role).toBe('user')
  })

  it('reports token usage to the spend hook, named by stage', async () => {
    const { setSpendRecorder } = await import('@/lib/ai/spend-hook')
    const seen: unknown[] = []
    setSpendRecorder((r) => seen.push(r))
    try {
      createMock.mockResolvedValue(
        reply(
          { answer: 'ok' },
          {
            usage: {
              input_tokens: 1200,
              output_tokens: 300,
              cache_read_input_tokens: 500,
              cache_creation_input_tokens: 100,
            },
          },
        ),
      )
      await callStructured({
        schema: Schema,
        system: [{ text: 's' }],
        user: 'u',
        effort: 'low',
        stage: 'extract-requirements',
      })

      expect(seen[0]).toMatchObject({
        stage: 'extract-requirements',
        model: 'claude-opus-5',
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      })
    } finally {
      setSpendRecorder(null)
    }
  })

  it('records spend for a billed response the schema then rejects', async () => {
    // messages.parse used to throw after the response arrived, discarding
    // its usage: the exact intermittent invalid-output CLAUDE.md warns about
    // billed ~16k tokens and left the spend counter flat.
    const { setSpendRecorder } = await import('@/lib/ai/spend-hook')
    const seen: { outputTokens: number }[] = []
    setSpendRecorder((r) => seen.push(r))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: '{"answer": "cut off mid' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 900, output_tokens: 16000 },
      })
      await expect(
        callStructured({
          schema: Schema,
          system: [{ text: 's' }],
          user: 'u',
          effort: 'low',
          stage: 'compose-cv',
        }),
      ).rejects.toMatchObject({ kind: 'invalid-output' })

      expect(seen).toHaveLength(1)
      expect(seen[0].outputTokens).toBe(16000)
      // Truncation and refusal used to be indistinguishable in the log.
      expect(spy.mock.calls.flat().join(' ')).toContain('max_tokens')
    } finally {
      setSpendRecorder(null)
      spy.mockRestore()
    }
  })

  it('owns the retry policy: the SDK is constructed with its own retries off', async () => {
    // The SDK default (maxRetries: 2) silently retries 429s and 529s under
    // our policy, turning "no retry on rate limit" into three attempts.
    createMock.mockResolvedValue(reply({ answer: 'ok' }))
    await callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low' })

    expect(ctorArgs[0]).toMatchObject({ maxRetries: 0 })
  })

  it('treats a response with no text block as invalid output, not a crash', async () => {
    createMock.mockResolvedValue({ content: [], stop_reason: 'refusal' })
    await expect(
      callStructured({ schema: Schema, system: [{ text: 's' }], user: 'u', effort: 'low' }),
    ).rejects.toMatchObject({ kind: 'invalid-output' })
  })

  it('logs the failing field when the schema rejects the output', async () => {
    // "The model returned an unexpected shape. Retry; if it persists, the
    // prompt needs fixing" is unactionable without the offending field:
    // a LinkedIn export's empty certification issuer looked identical to a
    // max_tokens truncation. The detail goes to stderr, which the packaged
    // app captures in datos/cvforge.log.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createMock.mockResolvedValue(reply({ answer: 42 }))

    await expect(
      callStructured({
        schema: Schema,
        system: [{ text: 's' }],
        user: 'u',
        effort: 'low',
        stage: 'compose-cv',
      }),
    ).rejects.toBeInstanceOf(AiError)

    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('compose-cv')
    expect(logged).toContain('answer')
    spy.mockRestore()
  })

  it('does not retry a 429 — retrying a rate limit immediately makes it worse', async () => {
    createMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('rate limited'), { status: 429 })
    })

    await callStructured({
      schema: Schema,
      system: [{ text: 's' }],
      user: 'u',
      effort: 'low',
    }).catch(() => undefined)

    expect(createMock).toHaveBeenCalledTimes(1)
  })
})

describe('classify', () => {
  it('recognises an exhausted credit balance, which arrives as a 400', async () => {
    const { classify } = await import('@/lib/ai/errors')
    const error = Object.assign(
      new Error('Your credit balance is too low to access the Anthropic API.'),
      {
        status: 400,
      },
    )
    expect(classify(error)).toBe('billing')
  })

  it('leaves other 400s as unknown', async () => {
    const { classify } = await import('@/lib/ai/errors')
    expect(classify(Object.assign(new Error('bad request'), { status: 400 }))).toBe('unknown')
  })

  it('recognises the SDK connection timeout, which carries no status code', async () => {
    // Client-side timeouts are APIConnectionTimeoutError with status
    // undefined — a 408 check alone can never classify them.
    const { classify } = await import('@/lib/ai/errors')
    class APIConnectionTimeoutError extends Error {}
    expect(classify(new APIConnectionTimeoutError('Request timed out.'))).toBe('timeout')
  })

  it('recognises the SDK connection error — offline is the common local-first failure', async () => {
    const { classify } = await import('@/lib/ai/errors')
    class APIConnectionError extends Error {}
    expect(classify(new APIConnectionError('Connection error.'))).toBe('network')
  })

  it('treats a 500 as transient, like a 529', async () => {
    const { classify } = await import('@/lib/ai/errors')
    expect(classify(Object.assign(new Error('internal'), { status: 500 }))).toBe('overloaded')
  })
})
