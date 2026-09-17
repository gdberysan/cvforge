import { readSettings } from '@/lib/settings'
import pkg from '@/package.json'

/**
 * The opt-in update notice. When (and only when) the user turned the toggle
 * on, the server fetches version.json from the product site at most once a
 * day — a static file, no identifiers, nothing about the user in the
 * request. LEEME's privacy section discloses this as the one exception to
 * "the app only talks to api.anthropic.com".
 *
 * The check never blocks a page: requests read the cached answer and the
 * refresh happens in the background, so the banner appears on the next
 * navigation after the fetch lands.
 */
const VERSION_URL = 'https://cvforge.korven.dev/version.json'
const CHECK_EVERY = 24 * 60 * 60 * 1000

let cache: { at: number; latest: string | null } = { at: 0, latest: null }
let inFlight = false

const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)

export function isNewer(candidate: string, current: string): boolean {
  const a = parse(candidate)
  const b = parse(current)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/** Cached, synchronous read: the newer version string, or null. */
export function updateAvailable(): string | null {
  if (!readSettings().updateCheck) return null
  refreshIfStale()
  return cache.latest && isNewer(cache.latest, pkg.version) ? cache.latest : null
}

function refreshIfStale(): void {
  if (inFlight || Date.now() - cache.at < CHECK_EVERY) return
  inFlight = true
  fetch(VERSION_URL, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      const version = (data as { version?: unknown } | null)?.version
      cache = { at: Date.now(), latest: typeof version === 'string' ? version : null }
    })
    .catch(() => {
      // Offline or the site is down: try again tomorrow, never complain.
      cache = { at: Date.now(), latest: cache.latest }
    })
    .finally(() => {
      inFlight = false
    })
}
