'use client'

import { useEffect, useRef } from 'react'

/**
 * Moves keyboard focus to the step's content when the step changes — not on
 * first load. Without it a keyboard or screen-reader user clicked "Huecos"
 * and stayed on the tab, with nothing announcing that the page below had
 * changed underneath them.
 */
export function FocusOnStep({ step }: { step: string }) {
  const previous = useRef(step)
  useEffect(() => {
    if (previous.current === step) return
    previous.current = step
    document.getElementById('step-content')?.focus({ preventScroll: true })
  }, [step])
  return null
}
