'use server'

import { fetchLinkedInDetail, isDiscoverEnabled } from '#discover'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { marketFromLocation } from '@/lib/discover/annotate'
import { effectiveMarkets } from '@/lib/markets'
import type { Market } from '@/lib/schemas'
import { postingFromDetail } from '@/lib/share/posting'

export type LinkedInRead =
  | { status: 'ok'; text: string; market: Market }
  | { status: 'empty' | 'failed' | 'off' }
  | ReturnType<typeof demoBlock>

/**
 * The one place a shared or handed-off LinkedIn link is read. Called by the
 * page's client component after it mounts, never by a render: a link
 * preview, a prefetch or a crawler opening /share must not make the Mac
 * fetch from LinkedIn. The id arrives from the client, so it is checked here.
 */
export async function readLinkedInPostingAction(jobId: string): Promise<LinkedInRead> {
  if (isDemo()) return demoBlock()
  if (!isDiscoverEnabled()) return { status: 'off' }
  if (!/^\d{6,}$/.test(jobId)) return { status: 'failed' }
  const owner = getProfile(db)
  const markets = owner ? effectiveMarkets(owner.preferences.markets, owner.basics.location) : []
  try {
    const detail = await fetchLinkedInDetail(jobId)
    const text = postingFromDetail(detail)
    if (!text) return { status: 'empty' }
    return { status: 'ok', text, market: marketFromLocation(detail.location ?? null, markets) }
  } catch {
    return { status: 'failed' }
  }
}
