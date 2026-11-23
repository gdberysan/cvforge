import { describe, expect, it } from 'vitest'
import { AiError } from '@/lib/ai/errors'
import { eventStream } from '@/lib/http/event-stream'
import { readEventStream } from '@/lib/sse-client'

async function events(response: Response) {
  const seen: Record<string, unknown>[] = []
  let failure: unknown = null
  await readEventStream(response.body, (e) => seen.push(e)).catch((e) => {
    failure = e
  })
  return { seen, failure: failure as { message?: string; code?: string } | null }
}

describe('eventStream', () => {
  it('frames every event for the client reader', async () => {
    const res = eventStream(
      async (send) => {
        send({ stage: 'writing' })
        send({ done: true })
      },
      { fallback: 'x' },
    )
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect((await events(res)).seen).toEqual([{ stage: 'writing' }, { done: true }])
  })

  it('keeps an AiError typed, and falls back for anything else', async () => {
    const typed = await events(
      eventStream(
        async () => {
          throw new AiError('overloaded', 'busy')
        },
        { fallback: 'x' },
      ),
    )
    expect(typed.failure?.code).toBe('overloaded')

    const other = await events(
      eventStream(
        async () => {
          throw new Error('boom')
        },
        { fallback: 'Unexpected error.' },
      ),
    )
    expect(other.failure).toMatchObject({ message: 'Unexpected error.', code: 'unexpected' })
  })

  it('lets a route describe its own errors', async () => {
    const res = eventStream(
      async () => {
        throw new RangeError('undated')
      },
      {
        fallback: 'x',
        describe: (e) =>
          e instanceof RangeError ? { error: 'dated?', code: 'undated' } : undefined,
      },
    )
    expect((await events(res)).failure?.code).toBe('undated')
  })

  it('finishes the work after the client has gone — paid results are still saved', async () => {
    let saved = false
    let release: () => void = () => {}
    const res = eventStream(
      async (send) => {
        await new Promise<void>((r) => (release = r))
        send({ stage: 'saving' })
        saved = true
      },
      { fallback: 'x' },
    )
    await res.body?.cancel()
    release()
    await new Promise((r) => setTimeout(r, 10))
    expect(saved).toBe(true)
  })

  it('tells the work whether the client is still there', async () => {
    const seen: boolean[] = []
    let release: () => void = () => {}
    const res = eventStream(
      async (_send, { connected }) => {
        seen.push(connected())
        await new Promise<void>((r) => {
          release = r
        })
        seen.push(connected())
      },
      { fallback: 'x' },
    )
    await new Promise((r) => setTimeout(r, 0))
    await res.body?.cancel()
    release()
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([true, false])
  })
})
