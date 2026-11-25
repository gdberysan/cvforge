import { isLoopback } from './same-origin'

/**
 * The one way into the desktop app: the Mac's own browser on a loopback host.
 * The server binds 127.0.0.1 in every launcher (packaged app, Windows script,
 * launchd job, `npm run dev`, `npm start`); a new one must too. That binding
 * is what makes the headers below trustworthy: Next keeps a client-sent
 * x-forwarded-for, so a request from another machine could claim a loopback
 * address. (A remote "tailnet" door existed until 2026-11-25; it was removed
 * with the owner's Tailscale setup.)
 */
export type Door = 'local'

const stripPort = (host: string) => host.replace(/:\d+$/, '').toLowerCase()

/** The socket address Next itself writes into x-forwarded-for for a direct local request. */
function isLoopbackAddress(ip: string): boolean {
  const a = ip.trim().toLowerCase()
  return a === '::1' || a.startsWith('127.') || a.startsWith('::ffff:127.')
}

/**
 * Which door a request came through: 'local', or null for none. Any sign of
 * a proxy (a forwarding identity header, a non-loopback client address, a
 * forwarded host different from Host) is refused outright: nothing is ever
 * meant to reach this server through one. Presence alone is not a sign: Next
 * fills x-forwarded-host (with Host) and x-forwarded-for (with the socket
 * address) on every request that lacks them.
 */
export function doorOf(headers: Headers): Door | null {
  const host = stripPort(headers.get('host') ?? '')
  const forwardedHost = headers.get('x-forwarded-host')
  const clientIp = headers.get('x-forwarded-for')?.split(',')[0] ?? ''
  const proxied =
    Boolean(headers.get('tailscale-user-login')) ||
    (clientIp !== '' && !isLoopbackAddress(clientIp)) ||
    (forwardedHost !== null && stripPort(forwardedHost) !== host)
  if (proxied) return null
  return isLoopback(host) ? 'local' : null
}
