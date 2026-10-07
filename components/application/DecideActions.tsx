'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { restoreApplicationAction, skipApplicationAction } from '@/app/(app)/triage/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

/**
 * The decision this step exists for, as two buttons. Pursuing writes nothing
 * — status follows from documents and outcomes — it only moves you on.
 * Discarding archives (the stats keep it); a discarded one can come back.
 */
export function DecideActions({
  applicationId,
  archived,
  nextHref,
  nextLabel,
}: {
  applicationId: string
  archived: boolean
  nextHref: string
  nextLabel: string
}) {
  const t = useT()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(
    action: (id: string) => Promise<{ ok: true } | { ok: false; error: string; code: string }>,
    then: () => void,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action(applicationId)
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        return
      }
      then()
    })
  }

  return (
    <div style={{ marginTop: 'var(--space-7)' }}>
      <div
        style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}
      >
        {archived ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isPending}
            onClick={() => run(restoreApplicationAction, () => router.refresh())}
          >
            {t('decide.restore')}
          </button>
        ) : (
          <>
            <Link href={nextHref} className="btn btn-primary">
              {nextLabel}
            </Link>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={isPending}
              onClick={() => run(skipApplicationAction, () => router.push('/pipeline'))}
            >
              {t('decide.skip')}
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-3)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
