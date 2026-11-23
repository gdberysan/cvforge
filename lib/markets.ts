import { z } from 'zod'

/**
 * Where a CV is aimed. Any country (ISO 3166-1 alpha-2, lowercase: 'mx',
 * 'co', 'es') or a remote market. Until 2026-11 this was a closed list of
 * three — mx, us-remote, eu-remote — which made every user Mexican; every
 * value stored then is still valid.
 *
 * A market decides three things and nothing else: how a bare "$" reads,
 * which Spanish a Spanish document is written in, and the spelling/length
 * line the composer gets. It is never experience: the distortion checker
 * must not treat a target market as something the person has done.
 */
export const REMOTE_MARKETS = ['us-remote', 'eu-remote', 'latam-remote'] as const
export type RemoteMarket = (typeof REMOTE_MARKETS)[number]

/** Codes Intl knows that are not countries (regions, the EU, unknown). */
const NOT_COUNTRIES = new Set(['eu', 'ez', 'un', 'qo', 'zz', 'xa', 'xb'])

function regionNames(locale: string): Intl.DisplayNames {
  return new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' })
}

let countryCache: readonly string[] | null = null

/** Every country code the runtime can name, sorted by code. */
export function countryCodes(): readonly string[] {
  if (countryCache) return countryCache
  const names = regionNames('en')
  const out: string[] = []
  for (let a = 97; a <= 122; a++) {
    for (let b = 97; b <= 122; b++) {
      const code = String.fromCharCode(a, b)
      if (NOT_COUNTRIES.has(code)) continue
      const upper = code.toUpperCase()
      if (!names.of(upper)) continue
      // Retired codes still have names (DD is "Germany", SU "Russia", UK
      // "United Kingdom"); keep only the code the runtime itself uses.
      if (Intl.getCanonicalLocales(`und-${upper}`)[0] !== `und-${upper}`) continue
      out.push(code)
    }
  }
  countryCache = out
  return out
}

export function isCountryMarket(value: string): boolean {
  return /^[a-z]{2}$/.test(value) && countryCodes().includes(value)
}

export function isMarket(value: string): boolean {
  return (REMOTE_MARKETS as readonly string[]).includes(value) || isCountryMarket(value)
}

/** Not model-facing: route bodies, the stored profile and demo seeds only. */
export const MarketSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine(isMarket, { message: 'unknown market' })
export type Market = string

/** A country's name in English: what the prompts say. */
export function countryNameEn(code: string): string {
  return regionNames('en').of(code.toUpperCase()) ?? code.toUpperCase()
}

const REMOTE_LABELS: Record<RemoteMarket, { en: string; es: string }> = {
  'us-remote': { en: 'US remote', es: 'EE. UU. remoto' },
  'eu-remote': { en: 'Europe remote', es: 'Europa remoto' },
  'latam-remote': { en: 'Latin America remote', es: 'Latinoamérica remoto' },
}

/** The market as the person reads it, in the UI language. */
export function marketLabel(market: Market, locale: 'en' | 'es'): string {
  const remote = REMOTE_LABELS[market as RemoteMarket]
  if (remote) return remote[locale]
  return regionNames(locale === 'es' ? 'es-419' : 'en').of(market.toUpperCase()) ?? market
}

/**
 * Countries whose own currency is written with a bare "$". On a CV for one
 * of them "$1.2M" means that currency; everywhere else it means dollars.
 */
const DOLLAR_SIGN_CURRENCY: Record<string, string> = {
  mx: 'MXN',
  co: 'COP',
  ar: 'ARS',
  cl: 'CLP',
  uy: 'UYU',
  do: 'DOP',
  cu: 'CUP',
  us: 'USD',
  ec: 'USD',
  sv: 'USD',
  pa: 'USD',
  pr: 'USD',
  ca: 'CAD',
  au: 'AUD',
  nz: 'NZD',
  sg: 'SGD',
  hk: 'HKD',
}

/** Which currency a bare "$" on a CV for this market stands for. */
export function dollarSignCurrency(market: Market): string {
  return DOLLAR_SIGN_CURRENCY[market] ?? 'USD'
}

/**
 * The Spanish a document is written in. The prompts are built from these
 * parts; Mexico's give back the exact words the prompts carried before
 * markets opened up, so a Mexican user's requests did not change.
 *
 * Storage still says 'es-MX' for "a Spanish document" (DocumentLanguage):
 * the variant is chosen at compose time from the market, not stored.
 */
export type SpanishVariant = {
  /** "Mexican Spanish" */
  name: string
  /** "es-MX" */
  tag: string
  /** The adjective for vocabulary and register: "Mexican". */
  people: string
  /** Peninsular Spanish is what an LLM drifts to; say no unless it is wanted. */
  notPeninsular: boolean
}

const DEMONYM: Record<string, string> = {
  mx: 'Mexican',
  co: 'Colombian',
  ar: 'Argentine',
  cl: 'Chilean',
  pe: 'Peruvian',
  ve: 'Venezuelan',
  ec: 'Ecuadorian',
  uy: 'Uruguayan',
  py: 'Paraguayan',
  bo: 'Bolivian',
  gt: 'Guatemalan',
  cr: 'Costa Rican',
  pa: 'Panamanian',
  do: 'Dominican',
  sv: 'Salvadoran',
  hn: 'Honduran',
  ni: 'Nicaraguan',
  cu: 'Cuban',
  pr: 'Puerto Rican',
}

export const NEUTRAL_SPANISH: SpanishVariant = {
  name: 'neutral Latin American Spanish',
  tag: 'es-419',
  people: 'Latin American',
  notPeninsular: true,
}

/** The Spanish of a market, or null when the market is not Spanish-speaking. */
export function spanishOf(market: Market): SpanishVariant | null {
  if (market === 'es') {
    return { name: 'peninsular Spanish', tag: 'es-ES', people: 'Spanish', notPeninsular: false }
  }
  if (market === 'latam-remote') return NEUTRAL_SPANISH
  const people = DEMONYM[market]
  if (!people) return null
  return {
    name: `${people} Spanish`,
    tag: `es-${market.toUpperCase()}`,
    people,
    notPeninsular: true,
  }
}

/** "a Mexican", "an Argentine". */
export function withArticle(word: string): string {
  return `${/^[AEIO]/i.test(word) ? 'an' : 'a'} ${word}`
}

/** The person's own Spanish: their first Spanish-speaking market, else neutral. */
export function personalSpanish(profileMarkets: readonly Market[]): SpanishVariant {
  for (const m of profileMarkets) {
    const v = spanishOf(m)
    if (v) return v
  }
  return NEUTRAL_SPANISH
}

/**
 * A Spanish document for this market: the market's own Spanish when it has
 * one, else the person's (a Colombian applying to a US-remote role in
 * Spanish writes Colombian Spanish).
 */
export function documentSpanish(
  market: Market | undefined,
  profileMarkets: readonly Market[],
): SpanishVariant {
  return (market ? spanishOf(market) : null) ?? personalSpanish(profileMarkets)
}

/** A one-page CV is the norm here; elsewhere two pages are expected. */
const ONE_PAGE = new Set(['us-remote', 'us', 'ca'])

/** The composer's market line: who reads it, spelling, how long. */
export function marketRule(market: Market, lengths: { onePage: string; twoPages: string }): string {
  if (market === 'us-remote') {
    return `Target market: US remote. US spelling. Bias hard toward a single page: ${lengths.onePage}`
  }
  if (market === 'eu-remote') return `Target market: Europe remote. ${lengths.twoPages}`
  if (market === 'latam-remote') return `Target market: Latin America remote. ${lengths.twoPages}`
  const name = countryNameEn(market)
  if (ONE_PAGE.has(market)) {
    const spelling = market === 'us' ? ' US spelling.' : ''
    return `Target market: ${name}.${spelling} Bias hard toward a single page: ${lengths.onePage}`
  }
  const spelling = market === 'gb' || market === 'ie' ? ' UK spelling.' : ''
  return `Target market: ${name}.${spelling} ${lengths.twoPages}`
}

/** The market to suggest when nothing else says: the person's first, else US remote. */
export function defaultMarket(profileMarkets: readonly Market[] | undefined): Market {
  return profileMarkets?.[0] ?? 'us-remote'
}

/**
 * The market a place names, or null when it names none: a country (English or
 * Spanish: "Bogotá, Colombia", "Ciudad de México"), or that country's remote
 * market when the text says remote and one exists. LinkedIn writes "City,
 * State, Country", so the last country named wins ("Atlanta, Georgia, United
 * States" is the US, not Georgia). Cities alone are not guessed.
 */
export function marketNamedIn(place: string | null | undefined): Market | null {
  if (!place) return null
  const l = foldPlace(place)
  let best: { code: string; at: number } | null = null
  for (const { code, pattern } of countryPatterns()) {
    for (const m of l.matchAll(pattern)) {
      if (!best || m.index > best.at) best = { code, at: m.index }
    }
  }
  if (!best) return null
  // "United States (Remote)" is the US remote market; "Mexico (Remote)" is
  // still Mexico: remote within one country.
  const remoteOf = `${best.code}-remote`
  return /\b(remote|remoto)\b/.test(l) && isMarket(remoteOf) ? remoteOf : best.code
}

/**
 * A suggestion, never a decision: the triage market control stays editable.
 * The country a location names; remote with no country, the person's first
 * remote market; anything else, their default.
 */
export function marketFromPlace(place: string | null, profileMarkets: readonly Market[]): Market {
  const named = marketNamedIn(place)
  if (named) return named
  if (place && /\b(remote|remoto)\b/.test(foldPlace(place))) {
    return profileMarkets.find((m) => !isCountryMarket(m)) ?? defaultMarket(profileMarkets)
  }
  return defaultMarket(profileMarkets)
}

/**
 * The markets to offer someone: the ones they saved, else the country their
 * own location names ("Ciudad de México" is Mexico), else none. A CV read for
 * the first time saves no markets, and "US remote" for a person in Mexico
 * mislabelled every posting and wrote US-spelling, one-page CVs for it.
 */
export function effectiveMarkets(
  saved: readonly Market[] | undefined,
  location: string | null | undefined,
): Market[] {
  if (saved && saved.length > 0) return [...saved]
  const home = marketNamedIn(location)
  return home && isCountryMarket(home) ? [home] : []
}

/**
 * The market a pasted posting names near its top (its title and location
 * line), or null. Only the first lines: further down, a posting mentions
 * countries for other reasons ("clients in Brazil").
 */
export function marketOfPosting(text: string): Market | null {
  const head = text.split('\n').slice(0, 4).join('\n').slice(0, 400)
  return marketNamedIn(head)
}

const foldPlace = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

let patternCache: { code: string; pattern: RegExp }[] | null = null

function countryPatterns(): { code: string; pattern: RegExp }[] {
  if (patternCache) return patternCache
  patternCache = countryCodes().map((code) => {
    const names = [...new Set([marketLabel(code, 'en'), marketLabel(code, 'es')].map(foldPlace))]
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    return { code, pattern: new RegExp(`\\b(?:${alt})\\b`, 'g') }
  })
  return patternCache
}
