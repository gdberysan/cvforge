'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { HapticsToggle } from '@/components/settings/HapticsToggle'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsGroup'
import { LocaleSwitch } from '@/components/ui/LocaleSwitch'
import { BuildInfo } from '@/web/lib/build-info'
import { DataCard } from '@/web/lib/data-card'
import { useDatabase } from '@/web/lib/database'
import { PasswordCard } from '@/web/lib/password-card'
import { useLoader } from '@/web/lib/use-loader'
import { WaysInSettings } from '@/web/lib/ways-in'

/** Ajustes in the browser: the key, the language, and the data as a file. */
export default function Page() {
  const t = useT()
  const { state } = useDatabase()
  const data = useLoader('settings')
  const shell = useLoader('shell')
  // Vibration exists only on a touch screen that can vibrate; elsewhere the
  // group holds only the language (HapticsToggle hides itself by the same test).
  const [canVibrate, setCanVibrate] = useState(false)
  // A wide screen already has the language in the top bar: shown here only
  // on a phone, where the bar has no room for it.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    setCanVibrate(touch && typeof navigator.vibrate === 'function')
    setPhone(window.matchMedia?.('(max-width: 600px)').matches ?? false)
  }, [])
  if (!data) return null
  const persisted = state.kind === 'ready' && state.persisted
  const keyGroup = (
    <SettingsGroup
      title={data.hasKey ? t('settings.group.key') : t('settings.group.keyMissing')}
      lede={data.hasKey ? undefined : t('settings.group.keyMissingLede')}
      alert={!data.hasKey}
    >
      <ApiKeyForm hasSavedKey={data.hasKey} envManaged={false} local />
    </SettingsGroup>
  )
  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="settings-page">
        <header className="settings-head">
          <h1 className="settings-h1">{t('settings.page.title')}</h1>
        </header>

        {/* What blocks everything comes first (standard point 3). */}
        {!data.hasKey && keyGroup}

        <SettingsGroup title={t('settings.group.status')} lede={t('web.settings.lede')}>
          {data.hasKey && (
            <SettingsRow
              label={<StatusLabel tone="ok">{t('settings.status.key')}</StatusLabel>}
              hint={t('settings.status.keyOk')}
            />
          )}
          {/* Only once there is something to lose: an empty install greeted
              with "your data could be erased" is alarm with no cause. */}
          {(persisted || shell?.started) && (
            <SettingsRow
              label={
                <StatusLabel tone={persisted ? 'ok' : 'attn'}>{t('web.data.storage')}</StatusLabel>
              }
              hint={persisted ? t('web.db.persisted') : t('web.db.notPersisted')}
            >
              {/* The fix is one tap away: the copy is in "Tus datos". */}
              {!persisted && (
                <a href="#tus-datos" className="btn btn-quiet">
                  {t('web.data.saveCopy')}
                </a>
              )}
            </SettingsRow>
          )}
          {data.unknownCost > 0 && (
            <SettingsRow
              label={<StatusLabel tone="attn">{t('web.job.unknownTitle')}</StatusLabel>}
              hint={t('web.job.unknownHint', { n: data.unknownCost })}
            />
          )}
        </SettingsGroup>

        {data.hasKey && keyGroup}

        {/* Before a profile the phone's bar shows the language itself. */}
        {((phone && shell?.started) || canVibrate) && (
          <SettingsGroup title={canVibrate ? t('settings.group.look') : t('settings.group.prefs')}>
            {phone && shell?.started && (
              <SettingsRow label={t('nav.language')}>
                <LocaleSwitch />
              </SettingsRow>
            )}
            <HapticsToggle />
          </SettingsGroup>
        )}

        <SettingsGroup title={t('waysIn.settings')} lede={t('waysIn.settingsLede')}>
          <WaysInSettings />
        </SettingsGroup>

        <SettingsGroup title={t('settings.group.data')} id="tus-datos">
          <PasswordCard />
          <DataCard />
        </SettingsGroup>

        <SettingsGroup title={t('web.build.group')}>
          <BuildInfo />
          <p className="privacy-link">
            <Link href="/privacidad" className="action">
              {t('privacy.link')}
            </Link>
          </p>
          <p className="colophon">{t('web.colophon')}</p>
        </SettingsGroup>
      </div>
    </main>
  )
}

/** A status row's label with its dot: green when fine, amber when it needs you. */
function StatusLabel({ tone, children }: { tone: 'ok' | 'attn'; children: React.ReactNode }) {
  return (
    <span className="status-label">
      <span className={`status-dot tone-${tone}`} aria-hidden />
      {children}
    </span>
  )
}
