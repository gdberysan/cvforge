/**
 * Proof that a state-changing POST came from CVForge's own page.
 *
 * A cross-origin POST is a "simple request", so without this any web page
 * the user visits could shut the app down or replace their database. The
 * app's own fetch carries an Origin matching the Host it called — but so
 * does a hostile page whose DNS name was rebound to 127.0.0.1: its Origin
 * and Host are both "evil.example:3000", equal and wrong. So the Host must
 * also be the loopback the app is served on, or the browser must vouch for
 * the request with Sec-Fetch-Site (a rebound page is cross-site there).
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  if (originHost !== host) return false

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) return fetchSite === 'same-origin'
  return isLoopback(host)
}

function isLoopback(host: string): boolean {
  const name = host
    .replace(/:\d+$/, '')
    .replace(/^\[(.*)\]$/, '$1')
    .toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}
