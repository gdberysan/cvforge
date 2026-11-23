'use client'

import { useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'

const PERIOD = /^(\d{4})-(\d{2})$/

/** Years offered, newest first: from next year back to 1960. */
function years(): number[] {
  const top = new Date().getFullYear() + 1
  return Array.from({ length: top - 1959 }, (_, i) => top - i)
}

/**
 * A month as people say it — "enero" and "2026" from two lists — stored as
 * the "2026-01" the profile keeps. Nobody types an ISO date. With `current`,
 * a checkbox says the job is still going, which is stored as no end at all.
 */
export function MonthField({
  id,
  label,
  value,
  onChange,
  current,
}: {
  id: string
  label: string
  /** "YYYY-MM", or '' while unset (or, with `current`, while still going). */
  value: string
  onChange: (next: string) => void
  /** Offer "I still work here": checked means no end month. */
  current?: { label: string; on: boolean; onToggle: (on: boolean) => void }
}) {
  const t = useT()
  const locale = useLocale()
  const match = PERIOD.exec(value)
  // Half a choice (a month, no year yet) is kept here until it is whole.
  const [month, setMonth] = useState(match?.[2] ?? '')
  const [year, setYear] = useState(match?.[1] ?? '')
  const names = Array.from({ length: 12 }, (_, i) => {
    const name = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, i, 1)))
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`
  })
  const set = (m: string, y: string) => {
    setMonth(m)
    setYear(y)
    onChange(m && y ? `${y}-${m}` : '')
  }
  const off = current?.on ?? false

  return (
    <fieldset className="month-field">
      <legend className="fact-label">{label}</legend>
      <div className="month-field-row">
        <select
          id={id}
          className="field"
          value={off ? '' : month}
          disabled={off}
          onChange={(e) => set(e.target.value, year)}
          aria-label={`${label}: ${t('month.month')}`}
        >
          <option value="">{t('month.month')}</option>
          {names.map((name, i) => {
            const v = String(i + 1).padStart(2, '0')
            return (
              <option key={v} value={v}>
                {name}
              </option>
            )
          })}
        </select>
        <select
          className="field"
          value={off ? '' : year}
          disabled={off}
          onChange={(e) => set(month, e.target.value)}
          aria-label={`${label}: ${t('month.year')}`}
        >
          <option value="">{t('month.year')}</option>
          {years().map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {current && (
        <label className="month-field-current">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => {
              current.onToggle(e.target.checked)
              onChange(e.target.checked ? '' : month && year ? `${year}-${month}` : '')
            }}
          />
          {current.label}
        </label>
      )}
    </fieldset>
  )
}
