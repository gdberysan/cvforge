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
    <div
      style={{
        marginTop: 'var(--space-5)',
        borderLeft: '2px solid var(--accent)',
        paddingLeft: 'var(--space-3)',
        maxWidth: '38em',
      }}
    >
      <p style={{ color: 'var(--text-muted)', font: 'var(--type-body-sm)' }}>
        {t('application.stale')}
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      )}
      <p style={{ marginTop: 'var(--space-3)' }} aria-live="polite">
        {running ? (
          <span className="fact">
            {stage === 'mapping' ? t('triage.stage.mapping') : t('triage.stage.starting')}
            <span className="cursor" aria-hidden style={{ marginLeft: 'var(--space-2)' }} />
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
