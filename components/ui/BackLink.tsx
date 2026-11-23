'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { IconChevron } from './icons'

/**
 * The way out of an inner page: a "‹ Hoy" pill at the top, and Esc.
 * Esc first leaves a field you are typing in (so it never throws away the
 * page you were writing on); pressed again, it goes back. It does nothing
 * while a sheet or dialog is open: those close on Esc themselves.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]')) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.matches('input, textarea, select') || el.isContentEditable)) {
        el.blur()
        return
      }
      router.push(href)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [href, router])
  return (
    <Link href={href} className="story-back" aria-keyshortcuts="Escape">
      <IconChevron flip />
      {label}
    </Link>
  )
}
