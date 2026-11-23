import { doorOf, isMacOnlyPath, isTailnetSameOrigin, type TailnetConfig } from './doors'
import { isSameOriginRequest } from './same-origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const refuse = (error: string, code: string) => Response.json({ error, code }, { status: 403 })

/**
 * The one gate in front of every request. Exactly two doors: the Mac's own
 * browser (loopback), and — only when configured — the owner's devices on their
 * tailnet (see doors.ts). A Host that is neither is a DNS-rebound page or a
 * stranger; a mutation without same-origin proof is another site spending
 * the key; restore and shutdown answer only to the Mac. The public demo is
 * read-only by design and exempt.
 */
export function guardRequest(
  request: Request,
  demo: boolean,
  tailnet: TailnetConfig | null = null,
): Response | null {
  if (demo) return null
  const door = doorOf(request.headers, tailnet)
  if (!door) return refuse('Forbidden host', 'forbidden')

  if (door === 'tailnet' && isMacOnlyPath(new URL(request.url).pathname)) {
    return refuse('Only from the Mac itself', 'mac-only')
  }
  if (!SAFE_METHODS.has(request.method)) {
    const sameOrigin =
      door === 'local'
        ? isSameOriginRequest(request)
        : isTailnetSameOrigin(request.headers, tailnet as TailnetConfig)
    if (!sameOrigin) return refuse('Cross-origin request', 'forbidden')
  }
  return null
}
