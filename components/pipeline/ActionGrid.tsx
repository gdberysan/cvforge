'use client'

import { type ReactNode, useId } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import {
  IconCalendar,
  IconHourglass,
  IconPhone,
  IconReply,
  IconSend,
  IconVerified,
  IconXCircle,
} from '@/components/ui/icons'
import type { OutcomeType } from '@/lib/schemas'
import { useLogOutcome } from './OutcomeButtons'
import { outcomeTone } from './OutcomeChip'

const ACTION_ICON: Partial<Record<OutcomeType, () => ReactNode>> = {
  applied: IconSend,
  acknowledged: IconReply,
  screen: IconPhone,
  interview: IconCalendar,
  offer: IconVerified,
  rejected: IconXCircle,
  ghosted: IconHourglass,
}

/**
 * The question, then its answers (spec 2026-10-17 §3): a prompt line directly
 * above an even 2×2 grid of equal 48px buttons, each an icon in the outcome's
 * tone and a word. A single move — "I sent it" before anything is sent — is
 * one full-width primary button instead. Logs through the same server action,
 * toast and undo as every other outcome button (`useLogOutcome`).
 */
export function ActionGrid({
  applicationId,
  actions,
  prompt,
  heading = false,
}: {
  applicationId: string
  /** What can happen next, in order; `nextOutcomes` in lib/stage gives the usual set. */
  actions: readonly OutcomeType[]
  /** The question the buttons answer, e.g. "9 días sin respuesta. ¿Qué pasó?". */
  prompt: string
  /** Seguimiento's third section: the question is its heading (an h3). */
  heading?: boolean
}) {
  const t = useT()
  const promptId = useId()
  const { log, error, isPending } = useLogOutcome(applicationId)
  if (actions.length === 0) return null
  const single = actions.length === 1

  return (
    // Each button points at the question it answers, so "Rechazada" is heard
    // with "9 días sin respuesta. ¿Qué pasó?" rather than on its own.
    <div className="action-ask">
      {heading ? (
        <h3 id={promptId} className="seg-heading">
          {prompt}
        </h3>
      ) : (
        <p id={promptId} className="action-prompt">
          {prompt}
        </p>
      )}
      <div className={`action-grid${single ? ' is-single' : ''}`}>
        {actions.map((type) => {
          const Glyph = ACTION_ICON[type]
          return (
            <button
              key={type}
              type="button"
              className={single ? 'action-btn is-primary' : `action-btn tone-${outcomeTone(type)}`}
              aria-describedby={promptId}
              disabled={isPending}
              onClick={() => log(type)}
            >
              {Glyph ? <Glyph /> : <span className="outcome-dot" aria-hidden />}
              {t(`action.${type}`)}
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="outcome-error">
          {error}
        </p>
      )}
    </div>
  )
}
