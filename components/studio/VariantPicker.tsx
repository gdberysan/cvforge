'use client'

import Link from 'next/link'
import { useState } from 'react'
import { applyVariantAction } from '@/app/(app)/cvs/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'
import type { CVContent, GroundingReport } from '@/lib/schemas'

/**
 * The free lane beside "Generate": one of the base CVs, copied in as this
 * application's CV and re-checked against this posting in code. Replacing a
 * CV that already exists takes a second click — it may be a paid one.
 */
export function VariantPicker({
  applicationId,
  variants,
  hasCv,
  onApplied,
}: {
  applicationId: string
  /** Composed base CVs in this application's document language. */
  variants: { id: string; label: string; stale: boolean }[]
  hasCv: boolean
  onApplied: (cv: CVContent, report: GroundingReport) => void
}) {
  const t = useT()
  const [selected, setSelected] = useState(variants[0]?.id ?? '')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (variants.length === 0) {
    return hasCv ? null : (
      <p className="variant-picker">
        <Link href="/cvs" className="action">
          {t('variants.pickerNone')}
        </Link>
      </p>
    )
  }

  async function apply() {
    if (hasCv && !confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setError(null)
    const result = await applyVariantAction(applicationId, selected)
    setBusy(false)
    setConfirming(false)
    if (result.ok) onApplied(result.cv, result.report)
    else setError(errorText(t, result.code, t('variants.applyFailed')))
  }

  return (
    <div className="variant-picker">
      <label htmlFor={`variant-${applicationId}`}>{t('variants.pickerLabel')}</label>
      <select
        id={`variant-${applicationId}`}
        className="field"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          setConfirming(false)
        }}
      >
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={apply} disabled={busy} className="btn btn-quiet">
        {confirming
          ? t('variants.applyConfirm')
          : variants.find((v) => v.id === selected)?.stale
            ? t('variants.applyRecheck')
            : t('variants.apply')}
      </button>
      {error && (
        <span role="alert" style={{ color: 'var(--signal-error)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
