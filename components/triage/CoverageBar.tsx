'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { Meta } from '@/components/ui/Meta'
import type { Coverage } from '@/lib/schemas'

/**
 * What you have is green (friendly redesign 2026-11-21), partial a mid grey,
 * missing a light red: three lightnesses, so they part without colour too.
 */
const SEGMENT_COLOR = {
  strong: 'var(--tone-strong)',
  partial: 'var(--bar-partial)',
  missing: 'var(--tone-missing-border)',
} as const

export function CoverageBar({ coverage }: { coverage: Coverage }) {
  const t = useT()
  const segments: (keyof typeof SEGMENT_COLOR)[] = [
    ...Array<'strong'>(coverage.mandatoryStrong).fill('strong'),
    ...Array<'partial'>(coverage.mandatoryPartial).fill('partial'),
    ...Array<'missing'>(coverage.mandatoryMissing).fill('missing'),
  ]

  if (segments.length === 0) {
    return <p className="fact-label">{t('coverage.none')}</p>
  }

  return (
    <div>
      <div
        style={{ display: 'flex', gap: 3 }}
        role="img"
        aria-label={t('coverage.aria', {
          strong: coverage.mandatoryStrong,
          total: coverage.mandatoryTotal,
        })}
      >
        {segments.map((kind, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by nature
            key={i}
            className="cov-seg"
            style={{
              // Left to right, one segment after the next: the bar is read in
              // that order, so it is drawn in that order.
              animationDelay: `${Math.min(i * 22, 400)}ms`,
              flex: 1,
              height: 8,
              borderRadius: 'var(--radius-xs)',
              background: SEGMENT_COLOR[kind],
            }}
          />
        ))}
      </div>

      <p className="fact" style={{ marginTop: 'var(--space-3)' }}>
        <Meta>
          {t('coverage.evidenced', {
            strong: coverage.mandatoryStrong,
            total: coverage.mandatoryTotal,
          })}
          {coverage.mandatoryPartial > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {t('coverage.partial', { n: coverage.mandatoryPartial })}
            </span>
          )}
          {coverage.mandatoryMissing > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {t('coverage.missing', { n: coverage.mandatoryMissing })}
            </span>
          )}
        </Meta>
      </p>
    </div>
  )
}
