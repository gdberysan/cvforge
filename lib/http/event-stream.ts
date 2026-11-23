import { AiError } from '@/lib/ai/errors'

/** Sends one event to the client; silent once the client has gone. */
export type Send = (event: unknown) => void

/** An error as the stream reports it: lib/sse-client.ts turns it into an ApiFailure. */
type ErrorEvent = { error: string; code: string }

/**
 * The app's event streams — triage, CV import, compose, base CVs — as one
 * implementation. Five copies of this loop used to live in four routes.
 *
 * What every stream needs, and why:
 * - Closing the tab must not discard paid work: `send` goes quiet once the
 *   client is gone, and `work` runs to the end regardless, so results are
 *   still saved. `connected()` tells the work whether anyone is still
 *   watching, so a finished run can notify the phone instead.
 * - Errors travel as events: the response committed a 200 with the stream,
 *   so a status code can no longer carry them. An AiError keeps its typed
 *   kind; anything else falls to `describe`, then to `fallback`.
 */
export function eventStream(
  work: (send: Send, ctx: { connected: () => boolean }) => Promise<void>,
  opts: { fallback: string; describe?: (error: unknown) => ErrorEvent | undefined },
): Response {
  const encoder = new TextEncoder()
  let open = true
  const stream = new ReadableStream({
    cancel() {
      open = false
    },
    async start(controller) {
      const send: Send = (event) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          open = false
        }
      }
      try {
        await work(send, { connected: () => open })
      } catch (error) {
        send(
          error instanceof AiError
            ? { error: error.userMessage, code: error.kind }
            : (opts.describe?.(error) ?? { error: opts.fallback, code: 'unexpected' }),
        )
      } finally {
        if (open) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
