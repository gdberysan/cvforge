'use client'

import { type ChangeEvent, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { SettingsRow } from '@/components/settings/SettingsGroup'
import { LOCALE_COOKIE } from '@/lib/i18n/locale'
import { blockedInApp } from '@/lib/ui/in-app'
import { dataChanged, workerApi } from './actions-client'
/**
 * The web edition's own data controls: the whole database as one file, out
 * and back in. A file from the desktop app imports too (its WAL header is
 * rewritten), and an import is checked before it replaces anything
 * (web/lib/db-file.ts). Replacing everything takes a second, explicit tap.
 */
import { BASE } from './base'

export function DataCard() {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function exportNow() {
    if (blockedInApp()) return
    setBusy(true)
    setMessage(null)
    try {
      const bytes = await (await workerApi()).exportDatabase()
      const day = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.sqlite3' }),
      )
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `cvforge-${day}.db`,
      })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMessage({ ok: true, text: t('web.data.exported') })
    } catch {
      setMessage({ ok: false, text: t('web.data.exportFailed') })
    } finally {
      setBusy(false)
    }
  }

  async function importNow() {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await (await workerApi()).importDatabase(
        new Uint8Array(await file.arrayBuffer()),
      )
      if (result.ok) {
        setMessage({ ok: true, text: t('web.data.imported') })
        setFile(null)
        dataChanged()
      } else {
        setMessage({ ok: false, text: t(`web.data.problem.${result.problem}`) })
      }
    } catch {
      setMessage({ ok: false, text: t('web.data.importFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsRow label={t('web.data.exportTitle')} hint={t('web.data.exportHint')}>
        <button type="button" className="btn btn-quiet" onClick={exportNow} disabled={busy}>
          {t('web.data.export')}
        </button>
      </SettingsRow>
      <SettingsRow label={t('web.data.importTitle')} hint={t('web.data.importHint')}>
        {/* A real button in our words, not the browser's "Choose File"
            (which also speaks the browser's language, not the app's). */}
        <label className="btn btn-quiet file-pick">
          {file ? t('web.data.pickAnother') : t('web.data.pick')}
          <input
            type="file"
            className="sr-only"
            accept=".db,.sqlite,application/vnd.sqlite3,application/octet-stream"
            aria-label={t('web.data.importTitle')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFile(e.target.files?.[0] ?? null)
              setMessage(null)
            }}
            disabled={busy}
          />
        </label>
        {file && (
          <button type="button" className="btn btn-primary" onClick={importNow} disabled={busy}>
            {t('web.data.importConfirm', { name: file.name })}
          </button>
        )}
      </SettingsRow>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'fact' : 'form-error'}>
          {message.text}
        </p>
      )}
      <EraseRow />
    </>
  )
}

/**
 * Removes everything this browser holds for CVForge: the database, the key,
 * shared screenshots not yet read, the cached pages, the language choice.
 * Two taps, the second one red and naming what goes; then a fresh first run.
 */
function EraseRow() {
  const t = useT()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function erase() {
    setBusy(true)
    setFailed(false)
    try {
      await (await workerApi()).erase()
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch {}
      await new Promise<void>((done) => {
        const req = indexedDB.deleteDatabase('cvforge-share')
        req.onsuccess = req.onerror = req.onblocked = () => done()
      })
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
      // biome-ignore lint/suspicious/noDocumentCookie: expiring the one first-party cookie (language)
      document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
      location.replace(`${BASE}/`)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <SettingsRow label={t('web.erase.title')} hint={t('web.erase.hint')}>
      {asking ? (
        <div className="erase-confirm">
          <p className="erase-warning">{t('web.erase.warning')}</p>
          <div className="erase-actions">
            <button type="button" className="btn btn-danger" onClick={erase} disabled={busy}>
              {busy ? t('web.erase.busy') : t('web.erase.confirm')}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              {t('web.erase.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger-outline" onClick={() => setAsking(true)}>
          {t('web.erase.ask')}
        </button>
      )}
      {failed && (
        <p role="alert" className="form-error">
          {t('web.erase.failed')}
        </p>
      )}
    </SettingsRow>
  )
}
