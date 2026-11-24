'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconCalendar, IconKey } from '@/components/ui/icons'
import { TRIAL_OUT } from '@/lib/api-failure'
import type { MessageKey } from '@/lib/i18n'

type Case = 'ended' | 'short' | 'full'

const CASES: Record<string, Case> = {
  'trial-ended': 'ended',
  'trial-short': 'short',
  'trial-unavailable': 'full',
}

/**
 * When a paid step fails because of the free trial's limits, wherever it
 * happened (ApiFailure raises TRIAL_OUT): one sheet that says which limit it
 * was and leads to the person's own key. The line under the button stays
 * too; the sheet is what makes the next step one tap away.
 */
export function TrialOutSheet() {
  const t = useT()
  const [which, setWhich] = useState<Case | null>(null)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = (event: Event) => {
      const found = CASES[(event as CustomEvent<string>).detail]
      if (found) setWhich(found)
    }
    window.addEventListener(TRIAL_OUT, on)
    return () => window.removeEventListener(TRIAL_OUT, on)
  }, [])

  useEffect(() => {
    if (which) sheet.current?.focus()
  }, [which])

  if (!which) return null
  const key = (part: 'title' | 'body') => `web.trialOut.${which}.${part}` as MessageKey
  return (
    <div className="in-app-scrim">
      <div
        ref={sheet}
        className="in-app-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-out-title"
        tabIndex={-1}
        onKeyDown={(e) => e.key === 'Escape' && setWhich(null)}
      >
        {/* What ran out, seen before it is read: the trial's meter, full or
            nearly, or a calendar for a day that is full for everyone. */}
        {which === 'full' ? (
          <span className="trial-out-mark" aria-hidden="true">
            <IconCalendar />
          </span>
        ) : (
          <span className={`trial-meter is-${which}`} aria-hidden="true">
            <span />
          </span>
        )}
        <h2 id="trial-out-title">{t(key('title'))}</h2>
        <p>{t(key('body'))}</p>
        <div className="in-app-actions">
          <Link
            href="/settings#clave"
            className="btn btn-primary icon-label"
            onClick={() => setWhich(null)}
          >
            <IconKey />
            {t('web.trialOut.connect')}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => setWhich(null)}>
            {t('web.trialOut.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
