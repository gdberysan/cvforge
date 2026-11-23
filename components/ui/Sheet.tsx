'use client'

import { type ReactNode, useEffect, useId, useRef } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconClose } from './icons'

/** Open sheets across the page: the scroll lock lifts only when the last one closes. */
let openSheets = 0

/**
 * Detail on demand: a native modal <dialog>, a bottom sheet on a phone and a
 * centred panel above 600px. Esc, the backdrop and the close button dismiss
 * it; focus goes back to whatever opened it.
 */
export function Sheet({
  open,
  onClose,
  title,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Added to the body, for a sheet whose blocks need their own rhythm. */
  className?: string
  children: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = useId()

  // The page behind an open sheet does not scroll. A class, not an inline
  // style, and counted, so closing one of two sheets keeps the lock; the
  // cleanup also runs when the sheet unmounts while open.
  useEffect(() => {
    if (!open) return
    openSheets++
    document.documentElement.classList.add('sheet-open')
    return () => {
      openSheets = Math.max(0, openSheets - 1)
      if (openSheets === 0) document.documentElement.classList.remove('sheet-open')
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.hasAttribute('open')) {
      opener.current = document.activeElement
      d.showModal()
    } else if (!open && d.hasAttribute('open')) {
      d.close()
    }
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click handler only catches backdrop taps; the keyboard path is the dialog's native Esc
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={() => {
        onClose()
        if (opener.current instanceof HTMLElement) opener.current.focus()
      }}
      onClick={(e) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (e.target === e.currentTarget) ref.current?.close()
      }}
    >
      {/* Contents exist only while open: a closed sheet is not a second
          copy of the page's facts sitting in the DOM. */}
      {open && (
        <div className={className ? `sheet-body ${className}` : 'sheet-body'}>
          <div className="sheet-head">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            <button type="button" className="sheet-close" onClick={() => ref.current?.close()}>
              <IconClose />
              <span className="sr-only">{t('ui.close')}</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
