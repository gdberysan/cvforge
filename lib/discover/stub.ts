/**
 * What a buyer build compiles instead of lib/discover/index.ts: next.config
 * resolves '#discover' here unless the build itself ran with
 * CVFORGE_DISCOVER=1. No scraper code is reachable from this file — that is
 * the point. The release gate (scripts/release.ts) proves it per release.
 */
import type { JobDetail, SearchOptions, SearchResult } from '@/lib/schemas/discover'

export { DiscoverError, type DiscoverErrorKind } from './errors'

export function isDiscoverEnabled(): boolean {
  return false
}

export type { SearchOptions }

export async function searchLinkedIn(_opts: SearchOptions): Promise<SearchResult> {
  throw new Error('discover was excluded from this build')
}

export async function fetchLinkedInDetail(_idOrUrl: string): Promise<JobDetail> {
  throw new Error('discover was excluded from this build')
}

export {
  type ApplicationLink,
  annotateCard,
  type CardAnnotation,
  linkedInJobId,
  marketFromLocation,
} from './annotate'
export {
  FRESHNESS_DAYS,
  freshnessFrom,
  postingAgeDays,
  type SearchPreset,
  searchPresets,
} from './presets'
