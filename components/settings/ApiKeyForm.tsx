'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { clearApiKeyAction, saveApiKeyAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

export function ApiKeyForm({
  hasSavedKey,
  envManaged,
}: {
  hasSavedKey: boolean
  envManaged: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    setStatus(null)
    startTransition(async () => {
      const result = await saveApiKeyAction(key)
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        return
      }
      setKey('')
      setStatus(`${t('settings.connected')} · ${t('settings.saved')}`)
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      await clearApiKeyAction()
      setStatus(t('settings.removed'))
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}
    >
      {envManaged && (
        <p className="fact" style={{ color: 'var(--text-muted)' }}>
          {t('settings.envManaged')}
        </p>
      )}
      <p className="fact" style={{ color: hasSavedKey ? 'var(--signal-ok)' : 'var(--text-muted)' }}>
        {hasSavedKey ? t('settings.hasKey') : t('settings.noKey')}
      </p>
      <label className="fact-label" htmlFor="api-key">
        {t('settings.keyLabel')}
      </label>
      <input
        id="api-key"
        className="field field-mono"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={t('settings.keyPlaceholder')}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <div
        style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending || key.trim().length === 0}
        >
          {isPending ? t('settings.saving') : t('settings.save')}
        </button>
        {hasSavedKey && (
          <button type="button" className="action-quiet" onClick={remove} disabled={isPending}>
            {t('settings.remove')}
          </button>
        )}
      </div>
      <p aria-live="polite" style={{ minHeight: '1.5em' }}>
        {status && <span style={{ color: 'var(--signal-ok)' }}>{status}</span>}
        {error && (
          <span role="alert" style={{ color: 'var(--signal-error)' }}>
            {error}
          </span>
        )}
      </p>
    </form>
  )
}
