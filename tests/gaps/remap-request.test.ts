import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from '@/lib/api-failure'
import { requestRemap } from '@/lib/gaps/remap-request'

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

const args = { postingRaw: 'posting text', market: 'mx' as const }

describe('requestRemap', () => {
  it('reports each stage the stream announces', async () => {
    global.fetch = vi.fn(async () =>
      streamOf(['data: {"stage":"mapping"}\n\n', 'data: {"done":true}\n\n']),
    ) as unknown as typeof fetch

    const stages: string[] = []
    await requestRemap({ ...args, onStage: (s) => stages.push(s) })

    expect(stages).toEqual(['mapping'])
  })

  it('sends the stored posting back, so the route re-maps instead of re-extracting', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      streamOf(['data: {"done":true}\n\n']),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await requestRemap(args)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toEqual({ text: 'posting text', market: 'mx' })
  })

  it('throws the reported failure rather than resolving quietly', async () => {
    global.fetch = vi.fn(async () =>
      streamOf(['data: {"error":"Rate limited","code":"rate-limited"}\n\n']),
    ) as unknown as typeof fetch

    await expect(requestRemap(args)).rejects.toBeInstanceOf(ApiFailure)
  })

  it('handles a plain JSON answer, which is what a cached posting returns', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestRemap(args)).resolves.toBeUndefined()
  })

  it('throws when a JSON answer carries an error', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'nope', code: 'invalid-request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestRemap(args)).rejects.toBeInstanceOf(ApiFailure)
  })
})
