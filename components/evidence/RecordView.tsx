'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { IconAddNumber, IconEdit } from '@/components/ui/icons'
import type { EvidenceItem } from '@/lib/schemas'

/**
 * An entry as you read it: the sentence (three lines at most), then its
 * numbers — or, for a result without one, the one thing it is waiting for.
 * A tap on the sentence or the pencil opens the editor in place; what kind
 * of entry it is gets chosen there, with each kind explained.
 */
export function RecordView({
  item,
  onOpen,
  onAddNumber,
}: {
  item: EvidenceItem
  onOpen: () => void
  onAddNumber: () => void
}) {
  const t = useT()
  // The strength score asks every achievement for a number; a skill or a
  // credential is never asked for one.
  const asksForNumber = item.kind === 'achievement' && item.metrics.length === 0
  return (
    <article className={item.strength === 'core' ? 'rec rec-read is-core' : 'rec rec-read'}>
      <button type="button" className="rec-text" onClick={onOpen}>
        {item.text}
      </button>
      <div className="rec-foot">
        <span className="rec-chips">
          {item.metrics.map((m, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: metrics carry no stable id
            <span key={i} className="metric-chip num">
              {m.raw}
            </span>
          ))}
          {asksForNumber && (
            <button
              type="button"
              className="metric-chip is-missing icon-label"
              onClick={onAddNumber}
            >
              <IconAddNumber />
              {t('record.addNumber')}
            </button>
          )}
        </span>
        <button
          type="button"
          className="rec-edit-btn"
          aria-label={t('record.editAria')}
          onClick={onOpen}
        >
          <IconEdit />
        </button>
      </div>
    </article>
  )
}
