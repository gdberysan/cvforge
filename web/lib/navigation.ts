'use client'

import { useRouter as useNextRouter } from 'next/dist/client/components/navigation'
/**
 * next/navigation for the web edition (aliased in web/next.config.ts). The
 * same exports as Next's, except that router.refresh() — which on the
 * desktop re-renders server components with fresh data — tells this page's
 * screens to reload theirs from the Worker (and re-reads the language).
 */
import { useMemo } from 'react'
import { dataChanged } from './actions-client'

export * from 'next/dist/client/components/navigation'

export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter()
  return useMemo(() => ({ ...router, refresh: () => dataChanged() }), [router])
}
