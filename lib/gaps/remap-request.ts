import { ApiFailure } from '@/lib/api-failure'
import type { Market } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'

/**
 * Re-scores a stored posting against the current evidence base.
 *
 * The posting is already saved, so the triage route notices its hash is cached
 * and the evidence hash has changed, keeps the requirement extraction, and
 * re-runs only the mapping — one paid call, not two.
 *
 * It answers as JSON when there is nothing to stream and as SSE otherwise.
 * Both shapes are handled here rather than in each caller, so the two places
 * that trigger a re-score cannot drift apart.
 */
export async function requestRemap(args: {
  postingRaw: string
  market: Market
  onStage?: (stage: string) => void
}): Promise<void> {
  const res = await fetch('/api/ai/triage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: args.postingRaw, market: args.market }),
  })

  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json()
    if (!res.ok) throw new ApiFailure(data.error, data.code)
    return
  }

  await readEventStream(res.body, (event) => {
    if (typeof event.stage === 'string') args.onStage?.(event.stage)
  })
}
