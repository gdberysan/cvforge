import { ApiFailure } from '@/lib/api-failure'

/**
 * Reads the app's own event streams: one JSON object per `data:` frame,
 * frames separated by a blank line, an `error` field carrying a typed
 * failure. Three components used to carry this loop verbatim, and none of
 * them guarded the parse — a proxy's HTML error page surfaced as
 * "Unexpected token" in the user's language of choice, which is none.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array> | null,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body?.getReader()
  if (!reader) throw new ApiFailure('The server returned nothing.', 'unexpected')

  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.replace(/^data: /, '').trim()
      if (!line) continue
      let event: Record<string, unknown>
      try {
        event = JSON.parse(line)
      } catch {
        throw new ApiFailure('The server sent something that was not an event.', 'unexpected')
      }
      if (typeof event.error === 'string') {
        throw new ApiFailure(event.error, typeof event.code === 'string' ? event.code : undefined)
      }
      onEvent(event)
    }
  }
}
