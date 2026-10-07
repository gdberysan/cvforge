'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { logOutcomeAction, undoOutcomeAction } from '@/app/(app)/pipeline/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText, type MessageKey } from '@/lib/i18n'
import type { ApplicationStatus } from '@/lib/schemas'
import { showToast } from '@/lib/ui/toast'

/**
 * One click, one outcome. The actions offered are the two or three things
 * that can actually happen next from this status — the whole outcomes layer
 * dies if logging costs more than a click (roadmap phase 5).
 */
const NEXT_ACTIONS: Partial<Record<ApplicationStatus, string[]>> = {
  triaged: ['applied'],
  drafting: ['applied'],
  applied: ['acknowledged', 'screen', 'rejected'],
  interviewing: ['interview', 'offer', 'rejected'],
}

export function OutcomeButtons({
  applicationId,
  status,
  extra = [],
}: {
  applicationId: string
  status: ApplicationStatus
  /** Extra outcome types for special contexts, e.g. "ghosted" on a stale row. */
  extra?: string[]
}) {
  const t = useT()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const actions = [...(NEXT_ACTIONS[status] ?? []), ...extra]
  if (actions.length === 0) return null

  function log(type: string) {
    setError(null)
    startTransition(async () => {
      const result = await logOutcomeAction(applicationId, type)
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        return
      }
      // Said back, with a way out: a one-click log is also a one-click mistake.
      showToast(t('outcome.logged', { outcome: t(`outcome.${type}` as MessageKey) }), async () => {
        await undoOutcomeAction(applicationId, result.outcomeId)
        router.refresh()
      })
    })
  }

  return (
    <span
      // Wraps: four outcomes in one row overflowed a 320px phone.
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
        alignItems: 'baseline',
      }}
      aria-live="polite"
    >
      {actions.map((type) => (
        <button
          key={type}
          type="button"
          className="action-quiet"
          disabled={isPending}
          onClick={() => log(type)}
        >
          {t(`outcome.${type}` as MessageKey)}
        </button>
      ))}
      {error && (
        <span role="alert" style={{ color: 'var(--signal-error)', font: 'var(--type-body-sm)' }}>
          {error}
        </span>
      )}
    </span>
  )
}
