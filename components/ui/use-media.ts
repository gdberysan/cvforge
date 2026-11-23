'use client'

import { useSyncExternalStore } from 'react'

/** The phone layout's breakpoint, as globals.css draws it. */
export const PHONE = '(max-width: 699px)'

/** A media query as state; false on the server and where matchMedia is missing. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const m = window.matchMedia(query)
      m.addEventListener?.('change', onChange)
      return () => m.removeEventListener?.('change', onChange)
    },
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  )
}
