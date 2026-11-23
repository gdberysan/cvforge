'use client'

import { useMemo } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { IconClose, IconPlus } from '@/components/ui/icons'
import { type ParsedMetric, parseMetric } from '@/lib/metrics/parse'
import type { Metric } from '@/lib/schemas'
import { CURRENCY_CODES } from '@/lib/schemas/metric'

/**
 * One field per figure, not four.
 *
 * You type the metric the way you would say it — "cut checkout abandonment
 * 18%" — and the value, unit and direction are parsed out and shown back as a
 * read-only reading. A currency picker appears only when the figure is
 * genuinely ambiguous ("$1.2M" differs between MXN and USD by ~17x), because
 * that is the one thing the parser must never guess.
 *
 * This matters beyond tidiness: an editor that is tedious stops being used,
 * and evidence with no metric can never carry a result in a generated CV.
 */
export function MetricRow({
  metrics,
  ask = false,
  focusWaiting = false,
  onChange,
}: {
  metrics: Metric[]
  /** A result with no number yet: its field is already there to type in. */
  ask?: boolean
  /** That waiting field takes the cursor (the first entry you came to fill). */
  focusWaiting?: boolean
  onChange: (m: Metric[]) => void
}) {
  const t = useT()
  // The waiting field is not a metric until something is typed in it; an
  // empty one is never sent (EvidenceEditor's `sendable`).
  const rows = metrics.length === 0 && ask ? [{ raw: '' }] : metrics
  const waiting = metrics.length === 0

  return (
    <div className="metric-list">
      {rows.map((metric, i) => (
        <MetricField
          // The waiting field has its own key: when it becomes a real metric
          // the input mounts anew, so "Add a number" lands the cursor in it.
          key={waiting ? 'waiting' : i}
          metric={metric}
          autoFocus={metric.raw === '' && (!waiting || focusWaiting)}
          onChange={(patch) =>
            onChange(rows.map((m, j) => (j === i ? { ...m, ...patch } : m)) as Metric[])
          }
          onRemove={waiting ? undefined : () => onChange(metrics.filter((_, j) => j !== i))}
        />
      ))}

      {!(waiting && ask) && (
        <button
          type="button"
          className="action icon-label metric-add"
          onClick={() => onChange([...metrics, { raw: '' }])}
        >
          <IconPlus />
          {t(waiting ? 'metric.addFirst' : 'metric.add')}
        </button>
      )}
    </div>
  )
}

function MetricField({
  metric,
  autoFocus,
  onChange,
  onRemove,
}: {
  metric: Metric
  autoFocus: boolean
  onChange: (patch: Partial<Metric>) => void
  /** Absent on the waiting field: there is nothing to remove yet. */
  onRemove?: () => void
}) {
  const t = useT()
  const parsed = useMemo(() => parseMetric(metric.raw), [metric.raw])

  const sync = (raw: string) => {
    const next = parseMetric(raw)
    onChange({
      raw,
      value: next.value,
      unit: next.unit,
      direction: next.direction,
      currency: next.currency ?? (next.needsCurrency ? metric.currency : undefined),
    })
  }

  const reading = formatReading(parsed, metric.currency)

  return (
    <div className="metric-field">
      <div className="metric-input">
        {/* You type the figure the way you would say it; what CVForge read
            from it shows underneath, so a misread is caught before it ships. */}
        {/* Grows to fit: the figure is the one thing to check before it
            ships, so it is never cut off at the field's edge. One line of
            meaning, so Enter does not break it. */}
        <AutoTextarea
          value={metric.raw}
          autoFocus={autoFocus}
          onChange={(e) => sync(e.target.value.replace(/\n/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          placeholder={t('metric.placeholder')}
          aria-label={t('metric.aria')}
          className="field"
        />
        {onRemove && (
          <button
            type="button"
            className="metric-remove"
            onClick={onRemove}
            aria-label={t('metric.remove')}
          >
            <IconClose />
          </button>
        )}
      </div>

      {(reading || parsed.needsCurrency) && (
        <div className="metric-reading">
          {reading && (
            <span>
              {t('metric.readsAs')}{' '}
              {/* The unit is data, so it keeps the casing it was typed in. */}
              <span className="datum">{reading}</span>
            </span>
          )}

          {parsed.needsCurrency && (
            <label className={`metric-currency${metric.currency ? '' : ' is-missing'}`}>
              <span>{t('metric.currency')}</span>
              <select
                value={metric.currency ?? ''}
                onChange={(e) =>
                  onChange({ currency: (e.target.value || undefined) as Metric['currency'] })
                }
                aria-label={t('metric.currencyAria')}
                className="field"
              >
                <option value="">—</option>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

/** "18%" and "3x" close up; a worded unit takes a space. */
function formatReading(parsed: ParsedMetric, currency?: Metric['currency']): string {
  if (parsed.value === undefined) return ''

  const value = formatValue(parsed.value)
  const unit = currency ?? parsed.unit
  const tight = unit === '%' || unit === 'x'
  const arrow = parsed.direction === 'down' ? ' ↓' : parsed.direction === 'up' ? ' ↑' : ''

  if (!unit) return `${value}${arrow}`
  return `${value}${tight ? '' : ' '}${unit}${arrow}`
}

function formatValue(value: number): string {
  if (value >= 1e6) return `${trim(value / 1e6)}M`
  if (value >= 1e3) return `${trim(value / 1e3)}k`
  return trim(value)
}

const trim = (n: number) => String(Number(n.toFixed(2)))
