'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteApplicationAction } from '@/app/(app)/application/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

/**
 * Deleting an application takes its documents with it, so it takes two
 * clicks. It sits quietly at the foot of Seguimiento, beside the aliases.
 */
export function DeleteApplication({ applicationId }: { applicationId: string }) {
  const t = useT()
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="app-delete" aria-live="polite">
      {error && (
        <span role="alert" className="app-delete-error">
          {error}
        </span>
      )}
      {!armed ? (
        <button type="button" className="btn btn-danger-outline" onClick={() => setArmed(true)}>
          {t('application.delete')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-danger"
          disabled={isPending}
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
    </div>
  )
}
