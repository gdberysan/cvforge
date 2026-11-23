'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { IconClose } from '@/components/ui/icons'

/**
 * A deletion you can take back for ten seconds.
 *
 * Evidence is expensive to produce — a record can be the output of a whole
 * interview — so removing one should not be a decision you make once and live
 * with. An ink pill in the page's left gutter, over the content but never
 * over the phone's bottom bar: loud enough to notice while you are still
 * looking at the gap you just made, quiet enough not to interrupt.
 */
export function UndoBar({
  label,
  onUndo,
  onDismiss,
}: {
  label: string
  /** Absent for a plain confirmation: then there is nothing to take back. */
  onUndo?: () => void
  onDismiss: () => void
}) {
  const t = useT()

  return (
    <div className="undo-bar" role="status">
      <span className="undo-label">{label}</span>
      {onUndo && (
        <button type="button" className="undo-act" onClick={onUndo}>
          {t('undo.undo')}
        </button>
      )}
      <button
        type="button"
        className="undo-close"
        onClick={onDismiss}
        aria-label={t('undo.dismiss')}
      >
        <IconClose />
      </button>
    </div>
  )
}
