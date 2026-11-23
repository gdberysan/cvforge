'use client'

import { useEffect } from 'react'
import { BASE } from './base'

/** Registers web/public/sw.js (the share target) once per load; never breaks the app. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {})
  }, [])
  return null
}
