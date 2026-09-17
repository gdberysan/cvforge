'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { Coverage } from '@/lib/schemas'

/**
 * Amber means STRONG here, deliberately departing from Korven's --signal-warn
 * alias (spec §10.3). In this system amber is the raven's eye — the positive
 * focal signal — so a fully covered posting should glow. Mapping it to a
 * warning would invert the meaning of the brand's only accent.
 */
const SEGMENT_COLOR = {
  strong: 'var(--accent)',
  partial: 'var(--text-muted)',
  missing: 'var(--signal-error)',
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
            style={{
              flex: 1,
              height: 8,
              borderRadius: 'var(--radius-xs)',
              background: SEGMENT_COLOR[kind],
            }}
          />
        ))}
      </div>

      <p className="fact" style={{ marginTop: 'var(--space-3)' }}>
        {t('coverage.evidenced', {
          strong: coverage.mandatoryStrong,
          total: coverage.mandatoryTotal,
        })}
        {coverage.mandatoryPartial > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            {'  ·  '}
            {t('coverage.partial', { n: coverage.mandatoryPartial })}
          </span>
        )}
        {coverage.mandatoryMissing > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            {'  ·  '}
            {t('coverage.missing', { n: coverage.mandatoryMissing })}
          </span>
        )}
      </p>
    </div>
  )
}
