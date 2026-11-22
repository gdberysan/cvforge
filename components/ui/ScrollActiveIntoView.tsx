'use client'

import { useEffect } from 'react'

/**
 * Keeps the selected item of a horizontal scroller in view: on a phone the
 * status tabs run past the screen, and a filter you picked must never be the
 * one you cannot see.
 */
export function ScrollActiveIntoView({ selector }: { selector: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector)
    if (typeof el?.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selector])
  return null
}
