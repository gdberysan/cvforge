'use client'

import { useEffect } from 'react'

/**
 * Registers public/sw.js once per load. Browsers only allow it on HTTPS or
 * localhost. Production only: the worker caches /_next/static/* as
 * immutable, which holds for a build (content-hashed names) but not for the
 * dev server, where a changed file keeps its name — a dev worker would keep
 * serving stale CSS and scripts. In development any registered worker is
 * removed instead.
 */
export function ServiceWorker({ buildId }: { buildId: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {})
      return
    }
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`).catch(() => {
      // An unregistered worker only costs the offline page and push; never break the app.
    })
  }, [buildId])
  return null
}
