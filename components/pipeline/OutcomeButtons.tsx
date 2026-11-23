'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { logOutcomeAction, undoOutcomeAction } from '@/app/(app)/pipeline/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText, type MessageKey } from '@/lib/i18n'
import type { ApplicationStatus } from '@/lib/schemas'
import { haptic } from '@/lib/ui/haptics'
import { momentFor, showMoment } from '@/lib/ui/moment'
import { showToast } from '@/lib/ui/toast'
import { OutcomeChip } from './OutcomeChip'

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

/**
 * The one-click log, shared by every surface that offers it (these chips,
 * the action grid): the server action, the error line, and the toast that
 * says it back with an undo — a one-click log is also a one-click mistake.
 */
export function useLogOutcome(applicationId: string) {
  const t = useT()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function log(type: string) {
    setError(null)
    startTransition(async () => {
      const result = await logOutcomeAction(applicationId, type)
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        return
      }
      const outcome = t(`outcome.${type}` as MessageKey)
      // A repeat tap logged nothing new: no undo, or it would take back the
      // one real event.
      if (result.repeated) {
        showToast(t('outcome.alreadyLogged', { outcome }))
        return
      }
      haptic('confirm')
      showToast(t('outcome.logged', { outcome }), async () => {
        await undoOutcomeAction(applicationId, result.outcomeId)
        router.refresh()
      })
      // The four logs that change a search get their printed moment.
      const kind = momentFor(type)
      if (kind) showMoment(kind, applicationId)
    })
  }

  return { log, error, isPending }
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
  const { log, error, isPending } = useLogOutcome(applicationId)

  const actions = [...(NEXT_ACTIONS[status] ?? []), ...extra]
  if (actions.length === 0) return null

  return (
    // Wraps: four outcomes in one row overflowed a 320px phone.
    <span className="outcome-row" aria-live="polite">
      {actions.map((type) => (
        <OutcomeChip key={type} type={type} disabled={isPending} onClick={() => log(type)} />
      ))}
      {error && (
        <span role="alert" className="outcome-error">
          {error}
        </span>
      )}
    </span>
  )
}
