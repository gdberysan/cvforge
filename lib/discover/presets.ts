import type { Market } from '@/lib/schemas'

/**
 * One-click search chips derived from what the app already knows — recent
 * role titles crossed with the preferred markets' locations. No storage:
 * the profile is the preset. Capped so the row stays a row.
 */
const MAX_PRESETS = 6

export type SearchPreset = { q: string; location: string }

const marketLocation = (market: Market): string => (market === 'mx' ? 'Mexico' : 'Remote')

export function searchPresets(experience: { title: string }[], markets: Market[]): SearchPreset[] {
  const titles = [...new Set(experience.map((e) => e.title))]
  // No markets configured is a real state (a fresh profile); a title still
  // deserves a chip, so fall back to Remote rather than showing nothing.
  const locations = markets.length ? [...new Set(markets.map(marketLocation))] : ['Remote']
  const presets: SearchPreset[] = []
  for (const q of titles) {
    for (const location of locations) {
      if (presets.length === MAX_PRESETS) return presets
      presets.push({ q, location })
    }
  }
  return presets
}

/**
 * Whole days between a LinkedIn card's posting date and now; null when the
 * card carried no datetime. Clamped at 0 so a future date (clock skew) reads
 * as "today" rather than a negative age. The page turns this into hoy/ayer/
 * hace Nd via i18n.
 */
export function postingAgeDays(date: string | null, nowIso: string): number | null {
  if (!date) return null
  const posted = Date.parse(date.includes('T') ? date : `${date}T00:00:00Z`)
  if (Number.isNaN(posted)) return null
  const nowDay = Math.floor(Date.parse(nowIso) / 86_400_000)
  const postedDay = Math.floor(posted / 86_400_000)
  return Math.max(0, nowDay - postedDay)
}

/** Options offered by the freshness filter, in display order. */
export const FRESHNESS_DAYS = [0, 1, 7, 14, 30] as const

/**
 * Default is 30 días, not "any time": a stale posting invites spending
 * triage money on a filled vacancy. An explicit 0 ("any time") is respected.
 */
export function freshnessFrom(raw: string | undefined): number {
  // Empty/absent both mean "not chosen" → the spend-protecting default.
  // (Number('') is 0, a valid option, so it must be caught before parsing.)
  if (raw === undefined || raw.trim() === '') return 30
  const days = Number(raw)
  return (FRESHNESS_DAYS as readonly number[]).includes(days) ? days : 30
}
