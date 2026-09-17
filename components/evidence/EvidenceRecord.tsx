'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import type { EvidenceItem } from '@/lib/schemas'
import { MetricRow } from './MetricRow'
import { TagRow } from './TagRow'

/**
 * One evidence record. The left rule encodes strength at a glance down a long
 * list; the mono id is shown because it is the handle a generated CV bullet
 * will cite, and hiding it would hide the product's whole premise.
 */
export function EvidenceRecord({
  item,
  onChange,
  onDelete,
}: {
  item: EvidenceItem
  onChange: (item: EvidenceItem) => void
  onDelete: (id: string) => void
}) {
  const t = useT()
  const isCore = item.strength === 'core'
  const [confirming, setConfirming] = useState(false)

  return (
    <article
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${isCore ? 'var(--accent)' : 'var(--graphite-500)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        boxShadow: 'var(--edge-top)',
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <span className="ident">{item.id}</span>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {/* The left rule already encodes strength; the word is the control,
              so it stays quiet. Amber is reserved for recorded data. */}
          <button
            type="button"
            className="action-quiet"
            onClick={() => onChange({ ...item, strength: isCore ? 'supporting' : 'core' })}
            title={t('record.strengthTitle')}
            style={isCore ? { color: 'var(--text-muted)' } : undefined}
          >
            {t(`record.${item.strength}`)}
          </button>

          {confirming ? (
            <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span className="fact-label" style={{ color: 'var(--signal-error)' }}>
                {t('record.deleteConfirm')}
              </span>
              <button
                type="button"
                className="action"
                onClick={() => onDelete(item.id)}
                style={{ color: 'var(--signal-error)' }}
              >
                {t('record.yes')}
              </button>
              <button type="button" className="action-quiet" onClick={() => setConfirming(false)}>
                {t('record.no')}
              </button>
            </span>
          ) : (
            <button type="button" className="action-quiet" onClick={() => setConfirming(true)}>
              {t('record.delete')}
            </button>
          )}
        </div>
      </header>

      {/* The card is as wide as the column; the sentence inside it is not.
          190 characters to a line is not a record you can read. */}
      <AutoTextarea
        value={item.text}
        onChange={(e) => onChange({ ...item, text: e.target.value })}
        aria-label={t('record.aria')}
        className="field-bare"
        style={{ maxWidth: '78ch' }}
      />

      {/* The narrative is what happened; below the rule is what can be cited.
          Keeping them apart is why the card reads as a record and not a form. */}
      <div
        className="stack"
        style={{
          marginTop: 'var(--space-4)',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--border-subtle)',
          gap: 'var(--space-4)',
        }}
      >
        <MetricRow metrics={item.metrics} onChange={(metrics) => onChange({ ...item, metrics })} />
        <TagRow tags={item.tags} onChange={(tags) => onChange({ ...item, tags })} />
      </div>
    </article>
  )
}
