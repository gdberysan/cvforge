'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { IconCheck } from '@/components/ui/icons'
import { Switch } from '@/components/ui/Switch'
import type { EvidenceItem } from '@/lib/schemas'
import { keepInView } from '@/lib/ui/keep-in-view'
import { MetricRow } from './MetricRow'
import { TagRow } from './TagRow'

/**
 * One entry, open for editing, in the order you work on it: the sentence,
 * its numbers, its skill tags, then what kind of entry it is, whether it is
 * key, and Done. What kind matters because the score asks every result for a
 * number: something that is really a skill or a description is reclassified
 * here, never padded with an invented figure.
 */
const KINDS = ['achievement', 'project-highlight', 'skill-claim', 'credential'] as const
export function EvidenceRecord({
  item,
  onChange,
  onDelete,
  onDone,
  numberOnly = false,
  focusNumber = false,
}: {
  item: EvidenceItem
  onChange: (item: EvidenceItem) => void
  onDelete: (id: string) => void
  /** Back to the read view. Absent while the record cannot close (a blank draft). */
  onDone?: () => void
  /**
   * Opened to add its number and nothing else (the strength card's "Add the
   * numbers"): the sentence to read, the field, Done — the rest one tap away.
   */
  numberOnly?: boolean
  /** The first of those: its field takes the cursor. */
  focusNumber?: boolean
}) {
  const t = useT()
  const isCore = item.strength === 'core'
  const [confirming, setConfirming] = useState(false)
  const [more, setMore] = useState(false)
  const kindId = `${item.id}-kind`
  const coreId = `${item.id}-core`
  const full = !numberOnly || more

  const done = onDone && (
    <button type="button" className="btn btn-quiet icon-label" onClick={onDone}>
      <IconCheck />
      {t('record.done')}
    </button>
  )

  return (
    <article
      className={`rec rec-edit${isCore ? ' is-core' : ''}${full ? '' : ' is-number-only'}`}
      // On a phone the keyboard covers the lower half of the screen: a field
      // that takes focus is moved above it.
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select'))
          keepInView(e.target)
      }}
    >
      {full ? (
        // The card is as wide as the column; the sentence inside it is not.
        <AutoTextarea
          value={item.text}
          onChange={(e) => onChange({ ...item, text: e.target.value })}
          aria-label={t('record.aria')}
          className="field-bare rec-textarea"
        />
      ) : (
        <p className="rec-quote">{item.text}</p>
      )}

      <div className="rec-part">
        <p className="rec-part-label">{t('record.numbers')}</p>
        <MetricRow
          metrics={item.metrics}
          ask={item.kind === 'achievement'}
          focusWaiting={focusNumber}
          onChange={(metrics) => onChange({ ...item, metrics })}
        />
      </div>

      {!full ? (
        <div className="rec-edit-actions">
          <button type="button" className="action-quiet" onClick={() => setMore(true)}>
            {t('record.more')}
          </button>
          {done}
        </div>
      ) : (
        <>
          <div className="rec-part">
            <p className="rec-part-label">{t('record.tags')}</p>
            <TagRow tags={item.tags} onChange={(tags) => onChange({ ...item, tags })} />
          </div>

          <footer className="rec-edit-foot">
            <div className="rec-edit-settings">
              <div className="rec-setting-block">
                <span className="rec-setting-group">
                  <label htmlFor={kindId} className="rec-setting">
                    {t('record.kindShort')}
                  </label>
                  <select
                    id={kindId}
                    value={item.kind}
                    onChange={(e) =>
                      onChange({ ...item, kind: e.target.value as EvidenceItem['kind'] })
                    }
                    aria-label={t('record.kindLabel')}
                    className="field rec-kind-select"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`record.kind.${k}`)}
                      </option>
                    ))}
                  </select>
                </span>
                <p className="rec-setting-hint">{t(`record.kindDef.${item.kind}`)}</p>
              </div>
              <div className="rec-setting-block">
                <span className="rec-setting-group">
                  <label htmlFor={coreId} className="rec-setting">
                    {t('record.coreLabel')}
                  </label>
                  <Switch
                    id={coreId}
                    checked={isCore}
                    label={t('record.coreLabel')}
                    onChange={(on) => onChange({ ...item, strength: on ? 'core' : 'supporting' })}
                  />
                </span>
                <p className="rec-setting-hint">{t('record.coreHint')}</p>
              </div>
            </div>
            <div className="rec-edit-actions">
              {confirming ? (
                <span className="rec-confirm">
                  <span className="fact-label is-error">{t('record.deleteConfirm')}</span>
                  <button
                    type="button"
                    className="action is-error"
                    onClick={() => onDelete(item.id)}
                  >
                    {t('record.yes')}
                  </button>
                  <button
                    type="button"
                    className="action-quiet"
                    onClick={() => setConfirming(false)}
                  >
                    {t('record.no')}
                  </button>
                </span>
              ) : (
                <button type="button" className="action-quiet" onClick={() => setConfirming(true)}>
                  {t('record.delete')}
                </button>
              )}
              {done}
            </div>
          </footer>
        </>
      )}
    </article>
  )
}
