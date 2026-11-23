/**
 * Discovery results annotated by what the pipeline already knows — derived
 * entirely from data in SQLite, never a new store. Pure functions: the page
 * supplies the rows and the clock.
 */

import { countryCodes, defaultMarket, isCountryMarket, isMarket, marketLabel } from '@/lib/markets'
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

/**
 * A suggestion, never a decision — the triage market control stays editable.
 * A country named in the location (English or Spanish: "Bogotá, Colombia",
 * "Ciudad de México") → that country, or its remote market when the posting
 * is remote and one exists; remote with no country → the profile's first
 * remote market; anything else → the profile default.
 * Cities alone are not guessed.
 */
export function marketFromLocation(
  location: string | null,
  profileMarkets: readonly Market[],
): Market {
  const fallback = defaultMarket(profileMarkets)
  if (!location) return fallback
  const l = fold(location)
  const remote = /\b(remote|remoto)\b/.test(l)
  // LinkedIn writes "City, State, Country": the last country named wins, so
  // "Atlanta, Georgia, United States" is the US, not Georgia.
  let best: { code: string; at: number } | null = null
  for (const { code, pattern } of countryPatterns()) {
    for (const m of l.matchAll(pattern)) {
      if (!best || m.index > best.at) best = { code, at: m.index }
    }
  }
  if (best) {
    // "United States (Remote)" is the US remote market; "Mexico (Remote)"
    // is still Mexico — remote within one country.
    const remoteOf = `${best.code}-remote`
    return remote && isMarket(remoteOf) ? remoteOf : best.code
  }
  if (remote) return profileMarkets.find((m) => !isCountryMarket(m)) ?? fallback
  return fallback
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

let patternCache: { code: string; pattern: RegExp }[] | null = null

function countryPatterns(): { code: string; pattern: RegExp }[] {
  if (patternCache) return patternCache
  patternCache = countryCodes().map((code) => {
    const names = [...new Set([marketLabel(code, 'en'), marketLabel(code, 'es')].map(fold))]
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    return { code, pattern: new RegExp(`\\b(?:${alt})\\b`, 'g') }
  })
  return patternCache
}
