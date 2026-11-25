import { doorOf } from './doors'
import { isSameOriginRequest } from './same-origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const refuse = (error: string, code: string) => Response.json({ error, code }, { status: 403 })

/**
 * The one gate in front of every request. One door: the Mac's own browser
 * (loopback, see doors.ts). A Host that is anything else is a DNS-rebound
 * page or a stranger; a mutation without same-origin proof is another site
 * spending the key. The public demo is read-only by design and exempt.
 */
export function guardRequest(request: Request, demo: boolean): Response | null {
  if (demo) return null
  if (!doorOf(request.headers)) return refuse('Forbidden host', 'forbidden')
  if (!SAFE_METHODS.has(request.method) && !isSameOriginRequest(request)) {
    return refuse('Cross-origin request', 'forbidden')
  }
  return null
}
