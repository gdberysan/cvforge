import { headers } from 'next/headers'
import { AgentSettingsGroup, AgentStatusRow } from '#satellite'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { BackupCard } from '@/components/settings/BackupCard'
import { HapticsToggle } from '@/components/settings/HapticsToggle'
import { KeyGuide } from '@/components/settings/KeyGuide'
import { PdfEngineSetup } from '@/components/settings/PdfEngineSetup'
import { PushCard } from '@/components/settings/PushCard'
import { RestoreCard } from '@/components/settings/RestoreCard'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsGroup'
import { UpdateToggle } from '@/components/settings/UpdateToggle'
import { LocaleSwitch } from '@/components/ui/LocaleSwitch'
import { latestAutoBackup } from '@/lib/db/auto-backup'
import { backupsDir, db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { doorOf, tailnetConfig } from '@/lib/http/doors'
import { getTranslate } from '@/lib/i18n/server'
import { listSubscriptions } from '@/lib/push/store'
import { isPdfEngineAvailable } from '@/lib/render/pdf'
import { readSettings } from '@/lib/settings'
import { formatDay } from '@/lib/ui/format-day'

export const dynamic = 'force-dynamic'

/**
 * Ajustes as groups with one anatomy (spec 2026-10-15 phase 4 §7): where
 * things stand first, then the key, the agent, notifications, appearance and
 * your data — each a title, one line on what it is for, and rows.
 */
export default async function SettingsPage() {
  const { t, locale } = await getTranslate()
  const settings = readSettings()
  const hasSavedKey = Boolean(settings.anthropicApiKey)
  const envManaged = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  // The key is saved from the Mac only: from the phone the form would offer
  // what the server refuses.
  const local = doorOf(await headers(), tailnetConfig()) === 'local'
  // Self-hiding friction: the install offer exists only for the machine with
  // no Chrome, no Edge and no downloaded Chromium. (The demo serves
  // pre-rendered PDFs, so it never needs the offer.)
  const pdfReady = isDemo() || (await isPdfEngineAvailable())
  const devices = isDemo() ? 0 : listSubscriptions(db).length
  const lastBackupFile = isDemo() ? null : latestAutoBackup(backupsDir())
  const lastBackup = lastBackupFile ? formatDay(lastBackupFile, locale) : null

  const dot = (tone: 'ok' | 'warn' | 'off') => (
    <span className={`status-dot tone-${tone}`} aria-hidden />
  )

  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="settings-page">
        <header className="page-head settings-head">
          <p className="eyebrow">{t('settings.page.eyebrow')}</p>
          <h1 className="settings-h1">{t('settings.page.title')}</h1>
          <p className="page-lede">{t('settings.page.lede')}</p>
        </header>

        <SettingsGroup title={t('settings.group.status')}>
          <SettingsRow
            label={
              <>
                {dot(hasSavedKey || envManaged ? 'ok' : 'warn')}
                {t('settings.status.key')}
              </>
            }
            hint={
              hasSavedKey || envManaged ? t('settings.status.keyOk') : t('settings.status.keyNone')
            }
          />
          <AgentStatusRow />
          <SettingsRow
            label={
              <>
                {dot(devices > 0 ? 'ok' : 'off')}
                {t('push.title')}
              </>
            }
            hint={t(
              devices === 1 ? 'settings.status.devices.one' : 'settings.status.devices.other',
              {
                n: devices,
              },
            )}
          />
          <SettingsRow
            label={
              <>
                {dot(lastBackup ? 'ok' : 'warn')}
                {t('settings.backup.title')}
              </>
            }
            hint={
              lastBackup
                ? t('settings.status.backupOn', { date: lastBackup })
                : t('settings.status.backupNone')
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.group.key')} lede={t('settings.lede')}>
          <ApiKeyForm hasSavedKey={hasSavedKey} envManaged={envManaged} local={local} />
        </SettingsGroup>
        <KeyGuide />

        <AgentSettingsGroup />

        <SettingsGroup title={t('push.title')} lede={t('push.lede')}>
          <PushCard />
        </SettingsGroup>

        <SettingsGroup title={t('settings.group.look')}>
          <SettingsRow label={t('nav.language')}>
            <LocaleSwitch />
          </SettingsRow>
          <HapticsToggle />
        </SettingsGroup>

        <SettingsGroup title={t('settings.group.data')} lede={t('settings.group.dataLede')}>
          <UpdateToggle enabled={settings.updateCheck ?? false} />
          <BackupCard lastAuto={lastBackup} />
          <RestoreCard />
          {!pdfReady && <PdfEngineSetup />}
        </SettingsGroup>
      </div>
    </main>
  )
}
