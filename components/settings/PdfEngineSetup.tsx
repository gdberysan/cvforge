'use client'

import { useState, useTransition } from 'react'
import { installPdfEngineAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

/**
 * Rendered only when the engine ladder found nothing — no Chrome, no Edge,
 * no downloaded Chromium. Nearly nobody sees this card; the one user who
 * does gets the choice the terminal prompt used to ask everyone.
 */
export function PdfEngineSetup() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function install() {
    setError(null)
    startTransition(async () => {
      const result = await installPdfEngineAction()
      if (result.ok) {
        setState('done')
      } else {
        setState('error')
        // Localise via the error code like every other action surface; the raw
        // exec message is the fallback when there is no dictionary entry.
        setError(errorText(t, result.code, result.error))
      }
    })
  }

  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}>
      <p className="fact-label">{t('settings.pdf.title')}</p>
      {state === 'done' ? (
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--signal-ok)' }}>
          {t('settings.pdf.done')}
        </p>
      ) : (
        <>
          <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            {t('settings.pdf.missing')}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={isPending}
              onClick={install}
              style={{ justifySelf: 'start' }}
            >
              {t('settings.pdf.install')}
            </button>
            {isPending && (
              <span className="fact" style={{ color: 'var(--text-muted)' }} aria-live="polite">
                {t('settings.pdf.installing')}
              </span>
            )}
          </div>
          {error && (
            <p role="alert" style={{ color: 'var(--signal-error)', font: 'var(--type-body-sm)' }}>
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
