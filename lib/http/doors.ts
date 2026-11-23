import { isLoopback } from './same-origin'

/**
 * The two ways into CVForge. "Local" is today's: the Mac's own browser on a
 * loopback host. "Tailnet" exists only when configured: the owner's devices,
 * proxied by `tailscale serve`, which strips client-sent Tailscale-User-*
 * headers and sets them from the connecting device's identity. The server
 * binds 127.0.0.1, so serve is the only way a remote request arrives.
 *
 * That binding is what makes the headers below trustworthy: Next keeps a
 * client-sent x-forwarded-for, so a request from another machine could claim
 * a loopback address. Every launcher (packaged app, Windows script, launchd
 * job, `npm run dev`, `npm start`) passes 127.0.0.1; a new one must too.
 */
export type TailnetConfig = { host: string; login: string }
export type Door = 'local' | 'tailnet'

export function tailnetConfig(
  env: Record<string, string | undefined> = process.env,
): TailnetConfig | null {
  const host = env.CVFORGE_TAILNET_HOST?.trim().toLowerCase()
  const login = env.CVFORGE_TAILNET_LOGIN?.trim().toLowerCase()
  return host && login ? { host, login } : null
}

const stripPort = (host: string) => host.replace(/:\d+$/, '').toLowerCase()

/** The socket address Next itself writes into x-forwarded-for for a direct local request. */
function isLoopbackAddress(ip: string): boolean {
  const a = ip.trim().toLowerCase()
  return a === '::1' || a.startsWith('127.') || a.startsWith('::ffff:127.')
}

/**
 * Which door a request came through, or null for none. A request that shows
 * any sign of a proxy — a Tailscale identity header, a non-loopback client
 * address, a forwarded host different from Host — can only be the tailnet
 * door: if serve rewrote Host to loopback, treating it as local would admit
 * a tailnet device without checking who it is. Presence alone is not a sign:
 * Next fills x-forwarded-host (with Host) and x-forwarded-for (with the
 * socket address) on every request that lacks them.
 */
export function doorOf(headers: Headers, tailnet: TailnetConfig | null): Door | null {
  const host = stripPort(headers.get('host') ?? '')
  const forwardedHost = headers.get('x-forwarded-host')
  const clientIp = headers.get('x-forwarded-for')?.split(',')[0] ?? ''
  const login = headers.get('tailscale-user-login')
  const proxied =
    Boolean(login) ||
    (clientIp !== '' && !isLoopbackAddress(clientIp)) ||
    (forwardedHost !== null && stripPort(forwardedHost) !== host)

  if (!proxied) return isLoopback(host) ? 'local' : null
  if (!tailnet || login?.trim().toLowerCase() !== tailnet.login) return null
  if (host === tailnet.host) return 'tailnet'
  if (isLoopback(host) && forwardedHost && stripPort(forwardedHost) === tailnet.host)
    return 'tailnet'
  return null
}

/** Same-origin proof for a mutation through the tailnet door. */
export function isTailnetSameOrigin(headers: Headers, tailnet: TailnetConfig): boolean {
  const origin = headers.get('origin')
  if (!origin) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || stripPort(url.host) !== tailnet.host) return false
  const site = headers.get('sec-fetch-site')
  return !site || site === 'same-origin'
}

/** Routes that only the Mac itself may call: they replace data or stop the server. */
const MAC_ONLY = new Set(['/api/import/backup', '/api/shutdown'])

export function isMacOnlyPath(pathname: string): boolean {
  return MAC_ONLY.has(pathname.replace(/\/+$/, ''))
}
