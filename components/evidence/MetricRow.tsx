'use client'

import { useMemo } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { type ParsedMetric, parseMetric } from '@/lib/metrics/parse'
import type { Metric } from '@/lib/schemas'

/**
 * One field, not four.
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
  onChange,
}: {
  metrics: Metric[]
  onChange: (m: Metric[]) => void
}) {
  const t = useT()

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {metrics.map((metric, i) => (
        <MetricField
          // biome-ignore lint/suspicious/noArrayIndexKey: metrics carry no stable id
          key={i}
          metric={metric}
          autoFocus={metric.raw === ''}
          onChange={(patch) => onChange(metrics.map((m, j) => (j === i ? { ...m, ...patch } : m)))}
          onRemove={() => onChange(metrics.filter((_, j) => j !== i))}
        />
      ))}

      <button
        type="button"
        className="action-quiet"
        onClick={() => onChange([...metrics, { raw: '' }])}
        style={{ justifySelf: 'start' }}
      >
        {t('metric.add')}
      </button>
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
  onRemove: () => void
}) {
  const t = useT()
  const placeholder = t('metric.placeholder')
  const parsed = useMemo(() => parseMetric(metric.raw), [metric.raw])

  // Keep the stored record in step with what the text now says, without
  // clobbering a currency the user picked by hand.
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
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        {/* Sigil grammar: `$` is a command you issued, `>` is what the system
            made of it. The pair is the whole interaction, so it needs no label. */}
        <span aria-hidden className="fact" style={{ color: 'var(--text-faint)' }}>
          $
        </span>
        <input
          value={metric.raw}
          // biome-ignore lint/a11y/noAutofocus: a metric added by hand is added to be typed into
          autoFocus={autoFocus}
          onChange={(e) => sync(e.target.value)}
          placeholder={placeholder}
          aria-label={t('metric.aria')}
          className="field-line"
          // The field is sized to what it holds, so the hover underline hugs
          // the sentence and the remove control stays beside it instead of
          // stranded at the far edge of the card.
          style={{
            width: `${Math.max(metric.raw.length, placeholder.length) + 1}ch`,
            // minWidth:0 lets it shrink inside the flex row instead of forcing
            // the card wider than the viewport, which is what put a phone into
            // a horizontal scroll.
            minWidth: 0,
            maxWidth: '100%',
            color: 'var(--accent)',
          }}
        />
        <button
          type="button"
          className="action-quiet"
          onClick={onRemove}
          aria-label={t('metric.remove')}
        >
          ×
        </button>
      </div>

      {(reading || parsed.needsCurrency) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {reading && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              <span aria-hidden className="fact" style={{ color: 'var(--text-faint)' }}>
                &gt;
              </span>
              <span className="sr-only">{t('metric.readsAs')}</span>
              {/* The unit is data, so it keeps the casing it was typed in —
                  no label class may reach it. */}
              <span className="datum">{reading}</span>
            </span>
          )}

          {parsed.needsCurrency && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                borderLeft: '1px solid var(--border-subtle)',
                paddingLeft: 'var(--space-3)',
              }}
            >
              <span
                style={{
                  font: 'var(--type-mono)',
                  color: metric.currency ? 'var(--text-muted)' : 'var(--signal-error)',
                }}
              >
                {t('metric.currency')}
              </span>
              <select
                value={metric.currency ?? ''}
                onChange={(e) =>
                  onChange({ currency: (e.target.value || undefined) as Metric['currency'] })
                }
                aria-label={t('metric.currencyAria')}
                className="field-mono"
                style={{
                  padding: '2px 6px',
                  borderColor: metric.currency ? 'var(--border-subtle)' : 'var(--signal-error)',
                }}
              >
                <option value="">—</option>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
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
