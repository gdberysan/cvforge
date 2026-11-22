'use client'

import { useEffect, useRef, useState } from 'react'
import { type LinkedInRead, readLinkedInPostingAction } from '@/app/(app)/share/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { TriageConsole } from '@/components/triage/TriageConsole'
import type { Market } from '@/lib/schemas'

/**
 * The posting box for a LinkedIn job id: renders at once, then reads the
 * posting from the Mac once it is on screen. Nothing is analysed until the
 * person taps Analyse, so sharing alone never spends.
 */
export function LinkedInIntake({
  jobId,
  fallbackMarket,
  ownMarkets,
  compact = false,
}: {
  jobId: string
  fallbackMarket: Market
  ownMarkets?: readonly Market[]
  compact?: boolean
}) {
  const t = useT()
  const [read, setRead] = useState<LinkedInRead | null>(null)
  // React runs effects twice in development; a ref survives that, so the
  // posting is still read once.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    readLinkedInPostingAction(jobId).then(setRead, () => setRead({ status: 'failed' }))
  }, [jobId])

  if (!read) {
    return (
      <p role="status" className="fact intake-note">
        {t('share.reading')}
      </p>
    )
  }
  // The demo has no reader either: its guard answers like a build without one.
  const status = 'status' in read ? read.status : 'off'
  const ok = 'status' in read && read.status === 'ok' ? read : null
  const notice =
    status === 'off'
      ? t('share.noReader')
      : status === 'empty'
        ? t('share.emptyPosting')
        : status === 'failed'
          ? t('share.fetchFailed')
          : null
  return (
    <>
      {notice && (
        <p role="status" className="fact intake-note">
          {notice}
        </p>
      )}
      <TriageConsole
        compact={compact}
        defaultMarket={ok ? ok.market : fallbackMarket}
        ownMarkets={ownMarkets}
        initialText={ok ? ok.text : ''}
        initialSource="linkedin"
        initialSourceUrl={`https://www.linkedin.com/jobs/view/${jobId}/`}
      />
    </>
  )
}
