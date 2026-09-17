'use client'

import { useState, useTransition } from 'react'
import { setUpdateCheckAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'

/** Opt-in, default off, and the note says exactly what gets fetched. */
export function UpdateToggle({ enabled }: { enabled: boolean }) {
  const t = useT()
  const [on, setOn] = useState(enabled)
  const [, startTransition] = useTransition()

  function toggle(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const result = await setUpdateCheckAction(next)
      if (!result.ok) setOn(!next)
    })
  }

  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}>
      <p className="fact-label">{t('settings.updates.title')}</p>
      <label
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          font: 'var(--type-body-sm)',
          color: 'var(--text-body)',
          cursor: 'pointer',
        }}
      >
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        {t('settings.updates.toggle')}
      </label>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-faint)' }}>
        {t('settings.updates.note')}
      </p>
    </section>
  )
}
