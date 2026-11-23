'use client'

import { type FormEvent, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconMark } from '@/components/ui/icons'
/**
 * The password prompt, when the lock is on. Nothing else of CVForge renders
 * until the vault opens. Forgetting the password is answered honestly: there
 * is no recovery, and the way forward is to erase and import a copy.
 */
import { BRAND } from '@/lib/brand'
import { BASE } from './base'
import { useDatabase } from './database'

export function UnlockScreen() {
  const t = useT()
  const { state, unlocked } = useDatabase()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [erasing, setErasing] = useState(false)
  if (state.kind !== 'locked') return null
  const api = state.api

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setWrong(false)
    try {
      const result = await api.unlock(password)
      if (result.ok) unlocked(result.interrupted)
      else setWrong(true)
    } finally {
      setBusy(false)
    }
  }

  async function eraseAll() {
    setBusy(true)
    await api.erase()
    try {
      localStorage.clear()
    } catch {}
    location.replace(`${BASE}/`)
  }

  return (
    <main id="main" tabIndex={-1} className="page welcome is-locked">
      <p className="lock-mark">
        <span aria-hidden className="brand-mark">
          <IconMark />
        </span>
        {BRAND}
      </p>
      <h1 className="welcome-title">{t('web.lock.unlockTitle')}</h1>
      <p className="welcome-lede">{t('web.lock.unlockLede')}</p>
      <form className="welcome-card unlock-form" onSubmit={submit}>
        <label className="intake-field">
          <span>{t('web.lock.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            // biome-ignore lint/a11y/noAutofocus: the only thing this screen asks for
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            aria-invalid={wrong}
          />
        </label>
        {wrong && (
          <p role="alert" className="form-error">
            {t('web.lock.wrong')}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>
          {busy ? t('web.lock.opening') : t('web.lock.open')}
        </button>
        <details className="unlock-forgot">
          <summary>{t('web.lock.forgot')}</summary>
          <p>{t('web.lock.forgotBody')}</p>
          {erasing ? (
            <div className="erase-actions">
              <button type="button" className="btn btn-danger" onClick={eraseAll} disabled={busy}>
                {t('web.erase.confirm')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setErasing(false)}>
                {t('web.erase.cancel')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setErasing(true)}>
              {t('web.lock.eraseStart')}
            </button>
          )}
        </details>
      </form>
    </main>
  )
}
