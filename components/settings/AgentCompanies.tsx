'use client'

import { useState, useTransition } from 'react'
import {
  addCompanyAction,
  deleteCompanyAction,
  toggleCompanyAction,
} from '@/app/(app)/settings/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { errorText } from '@/lib/i18n'
import type { FollowedCompany } from '@/lib/satellite/companies'
import { ago } from '@/lib/ui/ago'
import { SettingsRow } from './SettingsGroup'

/**
 * The companies the agent follows (spec 2026-10-16 agent stage B). Paste a
 * careers link or type a name; the agent reads each company's job site at
 * the start of its next scan.
 */
/** `null`: the agent has not been restarted on a build that makes the table. */
export function AgentCompanies({ companies: list }: { companies: FollowedCompany[] | null }) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (
    action: () => Promise<{ ok: boolean; code?: string; error?: string }>,
    after?: (out: { ok: boolean }) => void,
  ) => {
    setError(null)
    startTransition(async () => {
      const out = await action()
      if (out.ok) after?.(out)
      else setError(errorText(t, out.code, out.error ?? t('settings.agent.companies.failed')))
    })
  }

  if (list === null) {
    return (
      <SettingsRow
        label={t('settings.agent.companies')}
        hint={t('settings.agent.companies.outdated')}
      />
    )
  }
  const companies = list
  const roles = companies.reduce((sum, c) => sum + (c.enabled ? (c.openRoles ?? 0) : 0), 0)
  const count = t(
    companies.length === 1 ? 'settings.agent.companies.countOne' : 'settings.agent.companies.count',
    {
      n: companies.length,
      roles: t(
        roles === 1
          ? 'settings.agent.companies.openRolesOne'
          : 'settings.agent.companies.openRoles',
        { n: roles },
      ),
    },
  )

  const state = (c: FollowedCompany) => {
    if (c.lastStatus === 'not-found') return t('settings.agent.companies.notFound')
    if (c.lastStatus === 'error') return t('settings.agent.companies.error')
    if (!c.lastCheckedAt) return t('settings.agent.companies.never')
    return t('settings.agent.companies.checked', { ago: ago(c.lastCheckedAt, locale) })
  }

  return (
    <>
      <SettingsRow label={t('settings.agent.companies')} hint={count}>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(true)}>
          {t('settings.agent.companies.edit')}
        </button>
      </SettingsRow>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          setConfirming(null)
          setError(null)
          setFound(null)
        }}
        title={t('settings.agent.companies')}
      >
        <div className="agent-form">
          {companies.length === 0 ? (
            <p className="agent-help">{t('settings.agent.companies.empty')}</p>
          ) : (
            <ul className="search-list">
              {companies.map((c) => (
                <li key={c.id} className="search-item">
                  <div className="search-item-text">
                    <span className="search-item-label">{c.name}</span>
                    <span className="agent-help">
                      {[
                        t(`settings.agent.companies.site.${c.site}`),
                        c.openRoles === null
                          ? ''
                          : t(
                              c.openRoles === 1
                                ? 'settings.agent.companies.rolesOne'
                                : 'settings.agent.companies.roles',
                              { n: c.openRoles },
                            ),
                        state(c),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <div className="search-item-actions">
                    <Switch
                      checked={c.enabled}
                      onChange={(next) => run(() => toggleCompanyAction(c.id, next))}
                      label={c.name}
                      disabled={pending}
                    />
                    {confirming === c.id ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={pending}
                        aria-label={t('settings.agent.companies.confirmDelete', { name: c.name })}
                        onClick={() =>
                          run(
                            () => deleteCompanyAction(c.id),
                            () => setConfirming(null),
                          )
                        }
                      >
                        {t('settings.agent.companies.confirm')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={pending}
                        aria-label={t('settings.agent.companies.delete', { name: c.name })}
                        onClick={() => setConfirming(c.id)}
                      >
                        {t('settings.agent.companies.remove')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            className="agent-form"
            onSubmit={(e) => {
              e.preventDefault()
              setFound(null)
              setError(null)
              startTransition(async () => {
                const out = await addCompanyAction({ nameOrUrl: draft })
                if (out.ok) {
                  setDraft('')
                  setFound(
                    t('settings.agent.companies.found', {
                      site: t(`settings.agent.companies.site.${out.company.site}`),
                    }),
                  )
                } else {
                  setError(
                    errorText(t, out.code, out.error ?? t('settings.agent.companies.failed')),
                  )
                }
              })
            }}
          >
            <fieldset className="agent-fieldset">
              <legend className="fact-label">{t('settings.agent.companies.new')}</legend>
              <div>
                <label htmlFor="company-name" className="fact-label block">
                  {t('settings.agent.companies.field')}
                </label>
                <input
                  id="company-name"
                  className="field"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <p className="agent-help">{t('settings.agent.companies.hint')}</p>
              </div>
            </fieldset>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {t('settings.agent.companies.add')}
            </button>
          </form>
          {found && (
            <p role="status" className="settings-feedback">
              <span className="is-ok">{found}</span>
            </p>
          )}
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
