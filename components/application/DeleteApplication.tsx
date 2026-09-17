'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteApplicationAction } from '@/app/(app)/application/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

/** Deleting an application takes its documents with it, so it takes two clicks. */
export function DeleteApplication({ applicationId }: { applicationId: string }) {
  const t = useT()
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <p style={{ marginTop: 'var(--space-9)' }} aria-live="polite">
      {error && (
        <span role="alert" style={{ color: 'var(--signal-error)', marginRight: 'var(--space-3)' }}>
          {error}
        </span>
      )}
      {!armed ? (
        <button type="button" className="action-quiet" onClick={() => setArmed(true)}>
          {t('application.delete')}
        </button>
      ) : (
        <button
          type="button"
          className="action-quiet"
          disabled={isPending}
          style={{ color: 'var(--signal-error)' }}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteApplicationAction(applicationId)
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              router.push('/pipeline')
            })
          }
        >
          {t('application.deleteConfirm')}
        </button>
      )}
    </p>
  )
}
