'use client'

import { useState, useTransition } from 'react'
import { disconnectGmailAction, setMailSwitchAction } from '@/app/(app)/settings/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { Switch } from '@/components/ui/Switch'
import { errorText } from '@/lib/i18n'
import type { MailStatus, MailSwitchKey } from '@/lib/satellite/mail'
import { ago } from '@/lib/ui/ago'
import { SettingsRow } from './SettingsGroup'

const SWITCHES = [
  ['mailAlerts', 'alerts'],
  ['mailOutcomes', 'outcomes'],
  ['mailDrafts', 'drafts'],
] as const satisfies readonly (readonly [MailSwitchKey, keyof MailStatus])[]

const MYACCOUNT = 'https://myaccount.google.com/permissions'

/**
 * The Gmail connection as Ajustes shows it (spec 2026-10-16 agent stage B
 * §2): what state it is in, three switches, and Desconectar. Connecting
 * happens on the Mac (`npm run gmail:connect`), never here — no token passes
 * through this page. Disconnect only asks; the agent removes the token.
 */
export function AgentMail({ mail }: { mail: MailStatus }) {
  const t = useT()
  const locale = useLocale()
  const [on, setOn] = useState({
    alerts: mail.alerts,
    outcomes: mail.outcomes,
    drafts: mail.drafts,
  })
  const [asked, setAsked] = useState(mail.state === 'disconnecting')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const flip = (key: MailSwitchKey, field: keyof typeof on, next: boolean) => {
    setError(null)
    setOn((s) => ({ ...s, [field]: next }))
    start(async () => {
      const out = await setMailSwitchAction(key, next)
      if (!out.ok) {
        setOn((s) => ({ ...s, [field]: !next }))
        setError(errorText(t, out.code, out.error))
      }
    })
  }

  const disconnect = () => {
    setError(null)
    start(async () => {
      const out = await disconnectGmailAction()
      if (out.ok) setAsked(true)
      else setError(errorText(t, out.code, out.error))
    })
  }

  const connected = mail.state === 'connected' || mail.state === 'disconnecting'
  const stateText = asked
    ? t('settings.agent.mail.disconnecting')
    : mail.state === 'connected'
      ? mail.readAt
        ? t('settings.agent.mail.connected', { ago: ago(mail.readAt, locale) })
        : t('settings.agent.mail.connectedNever')
      : t(`settings.agent.mail.${mail.state}`)

  return (
    <>
      <SettingsRow
        label={t('settings.agent.mail')}
        hint={
          <>
            <span className="block" aria-live="polite">
              {stateText}
            </span>
            {connected && mail.account && <span className="block">{mail.account}</span>}
            {asked && (
              <span className="block">
                {t('settings.agent.mail.alsoRemove')}{' '}
                <a href={MYACCOUNT} target="_blank" rel="noreferrer noopener" className="action">
                  myaccount.google.com
                </a>
              </span>
            )}
          </>
        }
      >
        {mail.state === 'connected' && !asked && (
          <button type="button" className="btn btn-quiet" onClick={disconnect} disabled={pending}>
            {t('settings.agent.mail.disconnect')}
          </button>
        )}
      </SettingsRow>
      {connected &&
        SWITCHES.map(([key, field]) => (
          <SettingsRow key={key} label={t(`settings.agent.mail.${field}`)}>
            <Switch
              checked={on[field as 'alerts' | 'outcomes' | 'drafts']}
              onChange={(next) => flip(key, field as 'alerts' | 'outcomes' | 'drafts', next)}
              label={t(`settings.agent.mail.${field}`)}
              disabled={pending}
            />
          </SettingsRow>
        ))}
      {error && (
        <p role="alert" className="settings-feedback">
          <span className="is-error">{error}</span>
        </p>
      )}
    </>
  )
}
