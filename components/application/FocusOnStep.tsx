'use client'

import { useEffect, useRef } from 'react'

/**
 * The application is one page (friendly redesign 2026-11-21); a link that
 * names a part of it (`?step=gaps`, from Hoy or a button) scrolls there and
 * gives it keyboard focus, so a screen reader starts where the eye does.
 * The opening part (the answer) needs neither.
 */
export function FocusOnStep({ step }: { step: string }) {
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (done.current === step) return
    done.current = step
    if (step === 'overview' || step === 'decide') return
    const target = document.getElementById(`s-${step}`)
    if (!target) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
  }, [step])
  return null
}
