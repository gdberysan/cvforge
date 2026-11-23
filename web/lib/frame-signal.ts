'use client'

import { useEffect, useState } from 'react'
import { onJobs } from './jobs'

/** A job as the extension reads it off LinkedIn. */
export type FramedPosting = {
  title: string
  company: string
  location: string
  url: string
  text: string
}

const isPosting = (p: unknown): p is FramedPosting =>
  typeof p === 'object' &&
  p !== null &&
  ['title', 'company', 'location', 'url', 'text'].every(
    (k) => typeof (p as Record<string, unknown>)[k] === 'string',
  )

/**
 * Inside the extension's side panel, the analyse screen and the panel talk:
 *
 * - the screen says it is showing, and whether its posting is untouched
 *   (no typing, Analizar not pressed) — only then may the panel swap it for
 *   the job the person just opened on LinkedIn;
 * - the panel hands a new posting in, and the screen shows it in place —
 *   no reload, so nothing flashes.
 *
 * The flag goes only to an extension that frames this page (its origin,
 * never "*"); any other parent hears nothing. What comes in is shown in
 * the box and sent nowhere until the person presses Analizar.
 */

/** The framing extension's origin, or null when the parent is not one. */
function extensionParent(): string | null {
  if (window.parent === window) return null
  const origin = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0]
  return origin?.startsWith('chrome-extension://') ? origin : null
}
export function useFramedPosting(n: number, onPosting: (p: FramedPosting) => void): void {
  const [handler] = useState(() => ({ current: onPosting }))
  handler.current = onPosting

  useEffect(() => {
    if (window.parent === window) return
    const receive = (e: MessageEvent) => {
      // Only the extension's side panel hands postings in, not any page
      // that happens to frame this one.
      if (e.source !== window.parent || !e.origin.startsWith('chrome-extension://')) return
      if (e.data?.type !== 'cvforge:posting') return
      if (isPosting(e.data.posting)) handler.current(e.data.posting)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [handler])

  // Per posting shown (n): untouched until typed in or analysed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: n is the reset — each new posting starts untouched
  useEffect(() => {
    const parent = extensionParent()
    if (!parent) return
    const post = (untouched: boolean) =>
      window.parent.postMessage({ type: 'cvforge:frame', share: true, untouched }, parent)
    let touched = false
    const touch = () => {
      if (touched) return
      touched = true
      post(false)
    }
    post(true)
    const off = onJobs((jobs) => {
      if (jobs > 0) touch()
    })
    document.addEventListener('input', touch, true)
    return () => {
      off()
      document.removeEventListener('input', touch, true)
    }
  }, [n])

  // Leaving the screen (to a result, Hoy…): the panel must reload to show a job.
  useEffect(() => {
    const parent = extensionParent()
    if (!parent) return
    return () => window.parent.postMessage({ type: 'cvforge:frame', share: false }, parent)
  }, [])
}
