'use client'

import { useState, useTransition } from 'react'
import {
  addSearchAction,
  deleteSearchAction,
  toggleSearchAction,
} from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { errorText } from '@/lib/i18n'
import type { SavedSearch } from '@/lib/satellite/searches'
import { SettingsRow } from './SettingsGroup'

const EMPTY = { label: '', keywords: '', location: '', remote: false }

/**
 * The agent's saved searches — what Telegram's /buscar did, here instead
 * (spec 2026-10-15 Telegram alerts only). Each change is written at once;
 * the agent reads the list at the start of its next scan.
 */
export function AgentSearches({ searches }: { searches: SavedSearch[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (
    action: () => Promise<{ ok: boolean; code?: string; error?: string }>,
    after?: () => void,
  ) => {
    setError(null)
    startTransition(async () => {
      const out = await action()
      if (out.ok) after?.()
      else setError(errorText(t, out.code, out.error ?? t('settings.agent.searches.failed')))
    })
  }

  const on = searches.filter((s) => s.enabled).length
  const count = t(on === 1 ? 'settings.agent.searches.countOne' : 'settings.agent.searches.count', {
    on,
    total: searches.length,
  })

  return (
    <>
      <SettingsRow label={t('settings.agent.searches')} hint={count}>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(true)}>
          {t('settings.agent.searches.edit')}
        </button>
      </SettingsRow>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          setConfirming(null)
          setError(null)
        }}
        title={t('settings.agent.searches')}
      >
        <div className="agent-form">
          <ul className="search-list">
            {searches.map((s) => (
              <li key={s.id} className="search-item">
                <div className="search-item-text">
                  <span className="search-item-label">{s.label}</span>
                  <span className="agent-help">
                    {[
                      s.keywords,
                      s.location,
                      s.remote ? t('settings.agent.searches.remoteTag') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="search-item-actions">
                  <Switch
                    checked={s.enabled}
                    onChange={(next) => run(() => toggleSearchAction(s.id, next))}
                    label={s.label}
                    disabled={pending}
                  />
                  {confirming === s.id ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={pending}
                      aria-label={t('settings.agent.searches.confirmDelete', { label: s.label })}
                      onClick={() =>
                        run(
                          () => deleteSearchAction(s.id),
                          () => setConfirming(null),
                        )
                      }
                    >
                      {t('settings.agent.searches.confirm')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={pending}
                      aria-label={t('settings.agent.searches.delete', { label: s.label })}
                      onClick={() => setConfirming(s.id)}
                    >
                      {t('settings.agent.searches.remove')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <form
            className="agent-form"
            onSubmit={(e) => {
              e.preventDefault()
              run(
                () => addSearchAction(draft),
                () => setDraft(EMPTY),
              )
            }}
          >
            <fieldset className="agent-fieldset">
              <legend className="fact-label">{t('settings.agent.searches.new')}</legend>
              {(['label', 'keywords', 'location'] as const).map((key) => (
                <div key={key}>
                  <label htmlFor={`search-${key}`} className="fact-label block">
                    {t(`settings.agent.searches.${key}`)}
                  </label>
                  <input
                    id={`search-${key}`}
                    className="field"
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="agent-switch-row">
                <span>{t('settings.agent.searches.remote')}</span>
                <Switch
                  checked={draft.remote}
                  onChange={(next) => setDraft({ ...draft, remote: next })}
                  label={t('settings.agent.searches.remote')}
                />
              </div>
            </fieldset>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {t('settings.agent.searches.add')}
            </button>
          </form>
          {error && (
            <p role="alert" className="settings-feedback">
              <span className="is-error">{error}</span>
            </p>
          )}
        </div>
      </Sheet>
    </>
  )
}
