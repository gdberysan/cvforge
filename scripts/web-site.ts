/**
 * Assembles what the host serves (runs after `next build web` and
 * scripts/web-csp.ts): the landing page at the root and the app under its
 * base path, with the host's rules for both.
 *
 *   web/site/index.html      the landing page (web/landing/index.html) + its CSP
 *   web/site/favicon.svg     the mark
 *   web/site/app/…           the static export (web/out, built with basePath /app)
 *   web/site/_headers        Cloudflare Pages / the local server
 *   web/site/_redirects      the same, for one-page-per-id rewrites
 *   web/site/vercel.json     the same rules for Vercel (rumbo.korven.dev)
 *   web/site/version.json    the desktop app's update notice, for cvforge.korven.dev
 *
 * cvforge.korven.dev is retired onto this project: every path redirects here,
 * except /version.json, which installed desktop copies read once a day. It is
 * served byte for byte from web/landing/legacy/version.json; bump it there when
 * a desktop release should be offered.
 *
 * The landing's policy is stricter than the app's: no network but the visit
 * counter (when its token is set), and scripts only by hash. Its type is served from the site itself.
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildSync } from 'esbuild'
import { inlineHashes } from './web-csp'

const OUT = path.join('web', 'out')
const SITE = path.join('web', 'site')
const BASE = process.env.WEB_BASE ?? '/app'

/**
 * Visit counting on the landing pages only (never under /app/, beside the
 * key): Cloudflare Web Analytics, free, cookieless, nothing that identifies
 * a person. The privacy page says so ("privacy.none.body"). Empty env = off.
 */
// Site "rumbo.korven.dev" in Cloudflare Web Analytics (owner's account, added
// 2026-11-25). Public by design: it is in every page it counts.
export const CF_BEACON_TOKEN = process.env.CF_BEACON_TOKEN ?? '10e06069bd304462b72370e3c4db0c12'
const BEACON_SCRIPT = 'https://static.cloudflareinsights.com/beacon.min.js'
const BEACON_REPORT = 'https://cloudflareinsights.com'

export function beaconTag(token: string): string {
  return `<script type="module" src="${BEACON_SCRIPT}" data-cf-beacon='${JSON.stringify({ token })}'></script>`
}

export function landingPolicy(hashes: string[], beacon = false): string {
  return [
    "default-src 'self'",
    `script-src ${hashes.map((h) => `'sha256-${h}'`).join(' ')}${beacon ? ` ${BEACON_SCRIPT}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    beacon ? `connect-src ${BEACON_REPORT}` : "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/** Cloudflare's _headers, read as [path, {name: value}] rules. */
export function parseHeaders(text: string): [string, Record<string, string>][] {
  const rules: [string, Record<string, string>][] = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    if (!/^\s/.test(line)) rules.push([line.trim(), {}])
    else {
      const i = line.indexOf(':')
      const last = rules[rules.length - 1]
      if (last) last[1][line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return rules
}

/** The app's paths move under the base; the catch-all keeps covering the whole site. */
export const underBase = (p: string, base = BASE) => (p === '/*' ? p : `${base}${p}`)

/**
 * "/application/*\/gaps/*" -> Vercel's "/app/application/:p1/gaps/:p2(.*)". A
 * middle "*" is one segment; the last one takes the rest, trailing slash
 * included (Vercel matches "/x/" against it; a bare ":p*" did not).
 */
export function vercelSource(pattern: string): string {
  let n = 0
  const parts = pattern
    .split('/')
    .map((seg, i, all) => (seg === '*' ? `:p${++n}${i === all.length - 1 ? '(.*)' : ''}` : seg))
  return parts.join('/')
}

/**
 * The landing's extension button: the Chrome Web Store page once there is
 * one; until then, the "coming soon" line between the EXTENSION markers.
 */
export function withStore(html: string, store: string, label = 'Agregar a Chrome'): string {
  return html.replace(/<!--EXTENSION-->[\s\S]*?<!--\/EXTENSION-->/, (soon) =>
    store
      ? `<a class="btn" href="${store}" target="_blank" rel="noreferrer">${label}</a>`
      : soon.replace(/<!--\/?EXTENSION-->/g, ''),
  )
}

/** A landing page as served: the store button filled in, its own CSP first in <head>. */
function landingPage(file: string, store: string, label?: string): string {
  const beacon = /^[0-9a-f]{32}$/.test(CF_BEACON_TOKEN)
  let html = withStore(readFileSync(file, 'utf8'), store, label)
  if (beacon) html = html.replace('</body>', `${beaconTag(CF_BEACON_TOKEN)}\n</body>`)
  const meta = `<meta http-equiv="Content-Security-Policy" content="${landingPolicy(inlineHashes(html), beacon)}">`
  return html.replace('<head>', `<head>\n${meta}`)
}

/** The retired address: everything to Rumbo, except the update notice. */
export const LEGACY_HOST = 'cvforge.korven.dev'
export const LEGACY_REDIRECT = {
  source: '/((?!version\\.json$).*)',
  has: [{ type: 'host', value: LEGACY_HOST }],
  destination: 'https://rumbo.korven.dev/',
  permanent: true,
}
/** The free trial's routes: the app's SDK posts to /trial/v1/messages. */
export const TRIAL_REWRITES = [
  { source: '/trial/start{/}?', destination: '/api/trial?op=start' },
  { source: '/trial/status{/}?', destination: '/api/trial?op=status' },
  { source: '/trial/v1/messages{/}?', destination: '/api/trial?op=messages' },
  { source: '/trial/ops{/}?', destination: '/api/trial?op=ops' },
]
const LEGACY_HEADERS = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
]

if (process.argv[1]?.endsWith('web-site.ts')) {
  rmSync(SITE, { recursive: true, force: true })
  mkdirSync(SITE, { recursive: true })
  cpSync(OUT, path.join(SITE, BASE.replace(/^\//, '')), { recursive: true })

  // The landing in Spanish at the root and in English at /en/; one stylesheet.
  // The extension's store page, once approved: until then each says it is coming.
  const store = process.env.RUMBO_EXTENSION_URL ?? ''
  writeFileSync(
    path.join(SITE, 'index.html'),
    landingPage(path.join('web', 'landing', 'index.html'), store),
  )
  mkdirSync(path.join(SITE, 'en'), { recursive: true })
  writeFileSync(
    path.join(SITE, 'en', 'index.html'),
    landingPage(path.join('web', 'landing', 'en', 'index.html'), store, 'Add to Chrome'),
  )
  copyFileSync(path.join('web', 'landing', 'landing.css'), path.join(SITE, 'landing.css'))
  copyFileSync(path.join('web', 'app', 'icon.svg'), path.join(SITE, 'favicon.svg'))
  cpSync(path.join('web', 'landing', 'fonts'), path.join(SITE, 'fonts'), { recursive: true })
  copyFileSync(
    path.join('web', 'landing', 'legacy', 'version.json'),
    path.join(SITE, 'version.json'),
  )

  const headers = parseHeaders(readFileSync(path.join(OUT, '_headers'), 'utf8')).map(
    ([p, h]) => [underBase(p), h] as const,
  )
  writeFileSync(
    path.join(SITE, '_headers'),
    `# Generated by scripts/web-site.ts.\n${headers
      .map(
        ([p, h]) =>
          `${p}\n${Object.entries(h)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n')}`,
      )
      .join('\n\n')}\n`,
  )
  const redirects = readFileSync(path.join(OUT, '_redirects'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.trim().split(/\s+/))
    .map(([from = '', to = '', code = '200']) => [`${BASE}${from}`, `${BASE}${to}`, code] as const)
  writeFileSync(
    path.join(SITE, '_redirects'),
    `# Generated by scripts/web-site.ts.\n${redirects.map((r) => r.join('  ')).join('\n')}\n`,
  )

  // The free trial's one server function (web/trial): bundled to a single
  // file with no dependencies, so Vercel runs it as-is.
  mkdirSync(path.join(SITE, 'api'), { recursive: true })
  buildSync({
    entryPoints: [path.join('web', 'trial', 'vercel-entry.ts')],
    outfile: path.join(SITE, 'api', 'trial.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  })

  writeFileSync(
    path.join(SITE, 'vercel.json'),
    `${JSON.stringify(
      {
        $schema: 'https://openapi.vercel.sh/vercel.json',
        trailingSlash: true,
        headers: [
          ...headers.map(([p, h]) => ({
            source: p === '/*' ? '/(.*)' : p.replace(/\*$/, '(.*)'),
            headers: Object.entries(h).map(([key, value]) => ({ key, value })),
          })),
          { source: '/version.json', headers: LEGACY_HEADERS },
        ],
        redirects: [LEGACY_REDIRECT],
        functions: { 'api/trial.mjs': { maxDuration: 800 } },
        rewrites: [
          ...TRIAL_REWRITES,
          ...redirects.map(([from, to]) => ({ source: vercelSource(from), destination: to })),
        ],
      },
      null,
      2,
    )}\n`,
  )
  console.log(`site: landing + ${BASE}/ -> ${SITE}`)
}
