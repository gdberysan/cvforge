'use client'

import { useT } from '@/components/i18n/LocaleProvider'

/**
 * A deletion you can take back for ten seconds.
 *
 * Evidence is expensive to produce — a record can be the output of a whole
 * interview — so removing one should not be a decision you make once and live
 * with. It sits in the page's left gutter rather than floating centre-screen:
 * loud enough to notice while you are still looking at the gap you just made,
 * quiet enough not to interrupt.
 */
export function UndoBar({
  label,
  onUndo,
  onDismiss,
}: {
  label: string
  onUndo: () => void
  onDismiss: () => void
}) {
  const t = useT()

  return (
    <div
      className="undo-bar"
      role="status"
      style={{
        position: 'fixed',
        left: 'clamp(20px, 5vw, 64px)',
        bottom: 'var(--space-6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        boxShadow: 'var(--edge-top)',
      }}
    >
      <span className="fact" style={{ color: 'var(--text-muted)' }}>
        <span aria-hidden style={{ color: 'var(--text-faint)', marginRight: 'var(--space-2)' }}>
          &gt;
        </span>
        {label}
      </span>
      <button type="button" className="action" onClick={onUndo}>
        {t('undo.undo')}
      </button>
      <button
        type="button"
        className="action-quiet"
        onClick={onDismiss}
        aria-label={t('undo.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
