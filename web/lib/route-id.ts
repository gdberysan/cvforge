'use client'

import { usePathname } from 'next/navigation'

/**
 * A static site builds one page per dynamic route ("_"), and the host serves
 * it for every id (web/public/_redirects). The id is read from the address,
 * never from the build's placeholder.
 */
export function useRouteId(prefix: string): string | null {
  const path = usePathname()
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  const id = decodeURIComponent(rest.split('/')[0] ?? '')
  return id && id !== '_' ? id : null
}
