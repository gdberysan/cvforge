'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { IconCheck } from '@/components/ui/icons'
import type { MessageKey } from '@/lib/i18n'

export type OutcomeTone = 'ok' | 'steel' | 'missing' | 'quiet'

/** What happened, as a colour: good news green, a step steel, a no red, silence grey. */
export function outcomeTone(type: string): OutcomeTone {
  if (type === 'applied' || type === 'acknowledged' || type === 'offer') return 'ok'
  if (type === 'screen' || type === 'interview') return 'steel'
  if (type === 'rejected') return 'missing'
  return 'quiet'
}

/**
 * One family for every outcome, everywhere (spec 2026-10-15 phase 4 §5): the
 * same height, a dot in the outcome's tone, the word. A button where it logs
 * the outcome, a plain chip where it reports one.
 */
export function OutcomeChip({
  type,
  onClick,
  disabled = false,
}: {
  type: string
  onClick?: () => void
  disabled?: boolean
}) {
  const t = useT()
  const className = `outcome-chip tone-${outcomeTone(type)}`
  const inner = (
    <>
      {type === 'applied' ? <IconCheck /> : <span className="outcome-dot" aria-hidden />}
      <span className="outcome-label">{t(`outcome.${type}` as MessageKey)}</span>
    </>
  )
  return onClick ? (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  ) : (
    <span className={className}>{inner}</span>
  )
}
