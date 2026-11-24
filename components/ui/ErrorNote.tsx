'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconKey } from '@/components/ui/icons'

/**
 * A failed step, said as a callout rather than a red line: a mark, the
 * message, and the one action that gets past it when there is one — the
 * person's own key for the free trial's limits or a missing key, nothing
 * otherwise (a retry is the button they already have).
 */
export function ErrorNote({ children, code }: { children: ReactNode; code?: string }) {
  const t = useT()
  const toKey = code?.startsWith('trial-') || code === 'auth'
  return (
    <div role="alert" className="error-note">
      <span className="error-note-mark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          focusable="false"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5h.01" />
        </svg>
      </span>
      <div className="error-note-body">
        <p>{children}</p>
        {toKey && (
          <Link href="/settings#clave" className="btn btn-primary icon-label error-note-action">
            <IconKey />
            {t(code === 'auth' ? 'errorNote.toSettings' : 'errorNote.connectKey')}
          </Link>
        )}
      </div>
    </div>
  )
}
