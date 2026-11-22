'use client'

import { useEffect } from 'react'

/** Registers web/public/sw.js (the share target) once per load; never breaks the app. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
