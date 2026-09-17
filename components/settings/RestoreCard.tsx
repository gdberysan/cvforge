'use client'

import { type ChangeEvent, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import { readAsBase64 } from '@/lib/read-file'

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
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}>
      <p className="fact-label">{t('settings.restore.title')}</p>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
        {t('settings.restore.lede')}
      </p>

      {!file && (
        <label className="btn btn-quiet" style={{ justifySelf: 'start', cursor: 'pointer' }}>
          {t('settings.restore.choose')}
          <input type="file" accept=".db" onChange={pick} style={{ display: 'none' }} />
        </label>
      )}

      {file && !confirming && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span className="fact">{file.name}</span>
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            {t('settings.restore.start')}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setFile(null)}>
            {t('record.no')}
          </button>
        </div>
      )}

      {file && confirming && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <p role="alert" style={{ color: 'var(--signal-error)', font: 'var(--type-body-sm)' }}>
            {t('settings.restore.warning')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={restoring}
              onClick={restore}
              style={{ background: 'var(--signal-error)', borderColor: 'var(--signal-error)' }}
            >
              {restoring ? t('settings.restore.restoring') : t('settings.restore.confirm')}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={restoring}
              onClick={() => setConfirming(false)}
            >
              {t('record.no')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', font: 'var(--type-body-sm)' }}>
          {error}
        </p>
      )}
    </section>
  )
}
