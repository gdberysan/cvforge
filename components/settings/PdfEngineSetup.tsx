'use client'

import { useState, useTransition } from 'react'
import { installPdfEngineAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'
import { SettingsRow } from './SettingsGroup'

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
    <>
      <SettingsRow
        label={t('settings.pdf.title')}
        hint={state === 'done' ? t('settings.pdf.done') : t('settings.pdf.missing')}
      >
        {state !== 'done' && (
          <button type="button" className="btn btn-quiet" onClick={install} disabled={isPending}>
            {isPending ? t('settings.pdf.installing') : t('settings.pdf.install')}
          </button>
        )}
      </SettingsRow>
      {error && (
        <p role="alert" className="settings-feedback">
          <span className="is-error">{error}</span>
        </p>
      )}
    </>
  )
}
