/**
 * Discovery results annotated by what the pipeline already knows — derived
 * entirely from data in SQLite, never a new store. Pure functions: the page
 * supplies the rows and the clock.
 */

import { marketFromPlace } from '@/lib/markets'
import type { ApplicationStatus, Market } from '@/lib/schemas'
import type { JobCard } from '@/lib/schemas/discover'
import { storedMs } from '@/lib/time'

export type ApplicationLink = {
  id: string
  sourceUrl: string | null
  status: ApplicationStatus
  createdAt: string
}

export type CardAnnotation = {
  applicationId: string
  status: ApplicationStatus
  daysAgo: number
}

/**
 * The numeric job id from a LinkedIn job URL — slugs and query params vary
 * between visits, the id does not. Non-LinkedIn URLs never match: a numeric
 * id from another portal must not collide.
 */
export function linkedInJobId(url: string | null): string | null {
  if (!url || !/\/\/([^/]*\.)?linkedin\.com\/jobs\/view\//.test(url)) return null
  const m = url.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})(?:[/?#]|$)/)
  return m ? m[1] : null
}

export function annotateCard(
  card: JobCard,
  apps: ApplicationLink[],
  nowIso: string,
): CardAnnotation | null {
  const match = apps.find((a) => linkedInJobId(a.sourceUrl) === card.id)
  if (!match) return null
  const daysAgo = Math.max(
    0,
    Math.floor((Date.parse(nowIso) - storedMs(match.createdAt)) / 86_400_000),
  )
  return { applicationId: match.id, status: match.status, daysAgo }
}

/** A suggestion, never a decision: see marketFromPlace (lib/markets). */
export function marketFromLocation(
  location: string | null,
  profileMarkets: readonly Market[],
): Market {
  return marketFromPlace(location, profileMarkets)
}
