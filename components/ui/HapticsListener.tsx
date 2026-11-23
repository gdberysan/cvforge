'use client'

import { useEffect } from 'react'
import { haptic } from '@/lib/ui/haptics'

/**
 * One listener for the whole app: the tick when a finger switches to another
 * place. Places that never scroll tick on touch-down, so it lands as the
 * finger does; a choice that can sit in a sideways-scrolling row waits for
 * the confirmed tap, or every swipe across the row would buzz. A finger only
 * — a mouse or trackpad never vibrates — and never for where you already are.
 */
const ON_TOUCH = '.bottomnav a, .stepnav-item, .seg-link'
const ON_TAP = '.segmented label'
const HERE = '[aria-current="page"], [aria-current="step"], .is-on'

function tickFrom(e: Event, selector: string) {
  if ((e as PointerEvent).pointerType !== 'touch') return
  const place = (e.target as Element | null)?.closest?.(selector)
  if (place && !place.matches(HERE)) haptic('tick')
}

export function HapticsListener() {
  useEffect(() => {
    const onDown = (e: Event) => tickFrom(e, ON_TOUCH)
    const onClick = (e: Event) => tickFrom(e, ON_TAP)
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    document.addEventListener('click', onClick, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown, { capture: true })
      document.removeEventListener('click', onClick, { capture: true })
    }
  }, [])
  return null
}
