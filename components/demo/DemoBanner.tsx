'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { DEMO_LINKS } from '@/lib/demo/mode'

/** Honest about what this is (product spec §5.6), with the two doors out. */
export function DemoBanner() {
  const t = useT()
  return (
    <div
      role="note"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        padding: 'var(--space-2) var(--space-4)',
        font: 'var(--type-body-sm)',
        color: 'var(--text-muted)',
        display: 'flex',
        gap: 'var(--space-4)',
        alignItems: 'baseline',
        flexWrap: 'wrap',
      }}
    >
      <span>{t('demo.banner')}</span>
      <a className="action" href={DEMO_LINKS.get}>
        {t('demo.get')} →
      </a>
      <a className="action-quiet" href={DEMO_LINKS.how}>
        {t('demo.how')} →
      </a>
    </div>
  )
}
