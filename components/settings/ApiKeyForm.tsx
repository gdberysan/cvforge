'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { clearApiKeyAction, saveApiKeyAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'
import { SettingsRow } from './SettingsGroup'

/**
 * The key, in three states: from the phone it cannot be changed (saving is
 * Mac-only), so no form is offered; with a key saved it is one row until
 * "Cambiar"; with none, the form is the point of the group.
 */
export function ApiKeyForm({
  hasSavedKey,
  envManaged,
  local,
}: {
  hasSavedKey: boolean
  envManaged: boolean
  /** True on the Mac itself; false through the phone's tailnet door. */
  local: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [changing, setChanging] = useState(false)

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
      setChanging(false)
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

  const keyRow = (
    <SettingsRow
      label={
        <>
          <span className={`status-dot ${hasSavedKey ? 'tone-ok' : 'tone-warn'}`} aria-hidden />
          {hasSavedKey ? t('settings.key.saved') : t('settings.key.none')}
        </>
      }
      hint={envManaged ? t('settings.envManaged') : undefined}
    >
      {local && hasSavedKey && !changing && (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => setChanging(true)}>
            {t('settings.key.change')}
          </button>
          <button type="button" className="action-quiet" onClick={remove} disabled={isPending}>
            {t('settings.key.remove')}
          </button>
        </>
      )}
    </SettingsRow>
  )

  const feedback = (status || error) && (
    <p aria-live="polite" className="settings-feedback">
      {status && <span className="is-ok">{status}</span>}
      {error && (
        <span role="alert" className="is-error">
          {error}
        </span>
      )}
    </p>
  )

  if (!local) {
    return (
      <>
        {keyRow}
        <SettingsRow label={t('settings.key.fromMac')} />
      </>
    )
  }

  return (
    <>
      {/* With no key the group's own title already says so. */}
      {hasSavedKey && keyRow}
      {(!hasSavedKey || changing) && (
        <form
          className="settings-row is-stacked settings-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="settings-row-label" htmlFor="api-key">
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
          <div className="settings-row-control">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || key.trim().length === 0}
            >
              {isPending ? t('settings.saving') : t('settings.save')}
            </button>
            {changing && (
              <button type="button" className="btn btn-quiet" onClick={() => setChanging(false)}>
                {t('addRole.cancel')}
              </button>
            )}
          </div>
        </form>
      )}
      {feedback}
    </>
  )
}
