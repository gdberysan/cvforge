'use client'

import { useT } from '@/components/i18n/LocaleProvider'

/**
 * The reassurance is the feature (product spec §4.2): three steps, and what
 * it costs in the author's measured numbers. Screenshots are a launch asset.
 */
export function KeyGuide() {
  const t = useT()
  const steps = [t('guide.step1'), t('guide.step2'), t('guide.step3')]
  return (
    <aside
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        maxWidth: '36em',
      }}
    >
      <p className="fact-label">{t('guide.title')}</p>
      <ol
        style={{
          margin: 'var(--space-3) 0 0',
          paddingLeft: '1.4em',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        {steps.map((s) => (
          <li key={s} style={{ font: 'var(--type-body-sm)' }}>
            {s}
          </li>
        ))}
      </ol>
      <a
        className="action"
        href="https://console.anthropic.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-block', marginTop: 'var(--space-3)' }}
      >
        {t('guide.open')}
      </a>
      <p
        style={{
          color: 'var(--text-muted)',
          font: 'var(--type-body-sm)',
          marginTop: 'var(--space-4)',
        }}
      >
        {t('guide.cost')}
      </p>
    </aside>
  )
}
