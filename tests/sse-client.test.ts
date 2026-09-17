import { describe, expect, it } from 'vitest'
import { ApiFailure } from '@/lib/api-failure'
import { readEventStream } from '@/lib/sse-client'

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

describe('readEventStream', () => {
  it('reassembles frames split across chunks and yields each event once', async () => {
    const seen: unknown[] = []
    await readEventStream(
      stream(['data: {"stage":"extrac', 'ting"}\n\ndata: {"done":true,"n":1}\n\n']),
      (e) => seen.push(e),
    )
    expect(seen).toEqual([{ stage: 'extracting' }, { done: true, n: 1 }])
  })

  it('turns an error event into a typed failure', async () => {
    await expect(
      readEventStream(stream(['data: {"error":"Rate limited","code":"rate-limit"}\n\n']), () => {}),
    ).rejects.toMatchObject({ code: 'rate-limit', message: 'Rate limited' })
  })

  it('reports a non-event body as a typed failure instead of a parser exception', async () => {
    let caught: unknown
    try {
      await readEventStream(stream(['<html>502 Bad Gateway</html>\n\n']), () => {})
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ApiFailure)
    expect((caught as ApiFailure).code).toBe('unexpected')
  })

  it('fails typed when there is no body at all', async () => {
    await expect(readEventStream(null, () => {})).rejects.toBeInstanceOf(ApiFailure)
  })
})
