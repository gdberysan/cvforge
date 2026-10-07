'use client'

import { useEffect, useState } from 'react'

const KEY = 'cvforge:lastScore'

/**
 * The strength score, animated only when it actually moved since you last
 * saw it — 50 → 70 after expanding a role rolls up; an unchanged score just
 * sits there. Counting up from zero on every visit would be decoration
 * pretending to be news. Storage is a per-browser convenience: if it is
 * unavailable the number simply renders.
 */
export function ScoreChange({ value }: { value: number }) {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    let previous: number | null = null
    try {
      const raw = window.localStorage.getItem(KEY)
      previous = raw === null ? null : Number(raw)
      window.localStorage.setItem(KEY, String(value))
    } catch {
      return
    }
    if (previous === null || Number.isNaN(previous) || previous === value) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const from = previous
    const start = performance.now()
    const duration = 700
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - p) ** 3
      setShown(Math.round(from + (value - from) * eased))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    setShown(from)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{shown}</>
}
