'use client'

/**
 * Ajustes → Contraseña. Off: two fields and the plain warning that a lost
 * password means lost data. On: lock now, change it, or remove it. The
 * Worker does the work (web/worker/db.ts); this only asks and reports.
 */
import { type FormEvent, useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { SettingsRow } from '@/components/settings/SettingsGroup'
import { workerApi } from './actions-client'
import { useDatabase } from './database'

const MIN = 8

export function PasswordCard() {
  const t = useT()
  const { locked } = useDatabase()
  const [on, setOn] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    workerApi()
      .then((api) => api.isProtected())
      .then(setOn)
      .catch(() => setOn(false))
  }, [])
  if (on === null) return null

  const problem =
    first.length > 0 && first.length < MIN
      ? t('web.lock.short')
      : second.length > 0 && first !== second
        ? t('web.lock.mismatch')
        : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (problem || first.length < MIN || first !== second) return
    setBusy(true)
    setMessage(null)
    try {
      const api = await workerApi()
      if (on) await api.changePassword(first)
      else await api.protect(first)
      setMessage({ ok: true, text: t(on ? 'web.lock.changed' : 'web.lock.done') })
      setOn(true)
      setMode('idle')
      setFirst('')
      setSecond('')
    } catch {
      setMessage({ ok: false, text: t('web.lock.failed') })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setMessage(null)
    try {
      await (await workerApi()).unprotect()
      setOn(false)
      setMode('idle')
      setMessage({ ok: true, text: t('web.lock.removed') })
    } catch {
      setMessage({ ok: false, text: t('web.lock.failed') })
    } finally {
      setBusy(false)
    }
  }

  async function lockNow() {
    if ((await (await workerApi()).lockNow()) === 'busy') {
      setMessage({ ok: false, text: t('web.lock.busy') })
      return
    }
    locked()
  }

  return (
    <SettingsRow label={t('web.lock.title')} hint={t(on ? 'web.lock.onHint' : 'web.lock.offHint')}>
      {mode === 'set' ? (
        <form className="lock-form" onSubmit={save}>
          <label className="intake-field">
            <span>{t('web.lock.new')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="field"
            />
          </label>
          <label className="intake-field">
            <span>{t('web.lock.repeat')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              className="field"
            />
          </label>
          <p className={problem ? 'form-error' : 'lock-note'}>{problem ?? t('web.lock.warning')}</p>
          <div className="erase-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || Boolean(problem) || first.length < MIN || first !== second}
            >
              {busy ? t('web.lock.working') : t(on ? 'web.lock.change' : 'web.lock.turnOn')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setMode('idle')}>
              {t('web.erase.cancel')}
            </button>
          </div>
        </form>
      ) : mode === 'remove' ? (
        <div className="erase-confirm">
          <p className="erase-warning">{t('web.lock.removeWarning')}</p>
          <div className="erase-actions">
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              {t('web.lock.remove')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setMode('idle')}>
              {t('web.erase.cancel')}
            </button>
          </div>
        </div>
      ) : on ? (
        <div className="erase-actions">
          <button type="button" className="btn btn-primary" onClick={lockNow}>
            {t('web.lock.lockNow')}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setMode('set')}>
            {t('web.lock.change')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('remove')}>
            {t('web.lock.remove')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-quiet" onClick={() => setMode('set')}>
          {t('web.lock.turnOn')}
        </button>
      )}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'lock-note' : 'form-error'}
        >
          {message.text}
        </p>
      )}
    </SettingsRow>
  )
}
