'use client'

import { type ChangeEvent, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import { readAsBase64 } from '@/lib/read-file'
import { SettingsRow } from './SettingsGroup'

/**
 * The reverse of BackupCard, and far more dangerous: this replaces
 * everything currently stored with whatever is in the chosen file. Armed
 * behind an explicit warning + second click, matching the app's other
 * irreversible actions (a record's delete confirm, an application's
 * archive) — but louder, because this one has no undo bar.
 */
export function RestoreCard() {
  const t = useT()
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setError(null)
    setConfirming(false)
    setFile({ name: picked.name, base64: await readAsBase64(picked) })
  }

  async function restore() {
    if (!file) return
    setRestoring(true)
    setError(null)
    try {
      const res = await fetch('/api/import/backup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ backup: file.base64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new ApiFailure(data.error, data.code)
      // Everything just changed underneath every page and every piece of
      // client state at once — a router refresh would leave stale ids
      // scattered around. A full reload is the honest reset.
      window.location.reload()
    } catch (e) {
      setRestoring(false)
      setConfirming(false)
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('studio.failed'),
      )
    }
  }

  return (
    <>
      <SettingsRow label={t('settings.restore.title')} hint={t('settings.restore.lede')}>
        {!file && (
          <label className="btn btn-quiet file-pick">
            {t('settings.restore.choose')}
            <input type="file" accept=".db" onChange={pick} className="file-pick-input" />
          </label>
        )}
      </SettingsRow>

      {file && !confirming && (
        <div className="settings-row">
          <span className="fact settings-file">{file.name}</span>
          <div className="settings-row-control">
            <button type="button" className="btn btn-quiet" onClick={() => setFile(null)}>
              {t('record.no')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
              {t('settings.restore.start')}
            </button>
          </div>
        </div>
      )}

      {file && confirming && (
        <div className="settings-row is-stacked">
          <p role="alert" className="settings-warning">
            {t('settings.restore.warning')}
          </p>
          <div className="settings-row-control">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={restoring}
              onClick={() => setConfirming(false)}
            >
              {t('record.no')}
            </button>
            <button type="button" className="btn btn-danger" disabled={restoring} onClick={restore}>
              {restoring ? t('settings.restore.restoring') : t('settings.restore.confirm')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="settings-feedback">
          <span className="is-error">{error}</span>
        </p>
      )}
    </>
  )
}
