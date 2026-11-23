'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { requestRemap } from '@/lib/gaps/remap-request'
import { errorText } from '@/lib/i18n'
import type { Market } from '@/lib/schemas'

/**
 * One click instead of a re-paste. The posting is already stored; the triage
 * route notices the evidence base changed since this verdict, keeps the
 * cached requirement extraction, and re-runs only the mapping — a stale
 * "skip" can become a "worth it" after a new role gets interviewed.
 */
export function Reanalyse({ postingRaw, market }: { postingRaw: string; market: Market }) {
  const t = useT()
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      await requestRemap({ postingRaw, market, onStage: setStage })
      router.refresh()
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('triage.failed'),
      )
    } finally {
      setRunning(false)
      setStage(null)
    }
  }

  return (
    <div className="note note-action">
      <p>{t('application.stale')}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="note-actions" aria-live="polite">
        {running ? (
          <span className="intake-status">
            <span className="intake-spinner" aria-hidden />
            {stage === 'mapping' ? t('triage.stage.mapping') : t('triage.stage.starting')}
          </span>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={run}>
            {t('application.reanalyse')}
          </button>
        )}
      </p>
    </div>
  )
}
