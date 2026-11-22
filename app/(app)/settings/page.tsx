import { headers } from 'next/headers'
import { AgentCard } from '@/components/settings/AgentCard'
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
import { recentPostingTitles } from '@/lib/agent/search-titles'
import { latestAutoBackup } from '@/lib/db/auto-backup'
import { backupsDir, db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { doorOf, tailnetConfig } from '@/lib/http/doors'
import { getTranslate } from '@/lib/i18n/server'
import { localeTag } from '@/lib/locale-tag'
import { listSubscriptions } from '@/lib/push/store'
import { isPdfEngineAvailable } from '@/lib/render/pdf'
import { readCompanies } from '@/lib/satellite/companies'
import { readMailStatus } from '@/lib/satellite/mail'
import { readSearchTitles } from '@/lib/satellite/search-titles'
import { readSearches } from '@/lib/satellite/searches'
import { isAgentAvailable, readAgentStatus } from '@/lib/satellite/settings'
import { kitDailyCap, kitOnChase, readSettings, satelliteDbPath } from '@/lib/settings'
import { serverTimeZone } from '@/lib/time'
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
  // Personal installs only: the agent exists when the satellite's database
  // is configured and present. Buyers never see it.
  const agentFile = isDemo() ? undefined : satelliteDbPath()
  const agent = isAgentAvailable(agentFile) ? readAgentStatus(agentFile) : null
  const searches = agent && agentFile ? readSearchesSafe(agentFile) : undefined
  const companies = agent && agentFile ? readCompaniesSafe(agentFile) : undefined
  const mail = agent && agentFile ? readMailStatus(agentFile) : undefined
  // The titles the agent looks for (its own setting, seeded once from the
  // profile), previewed on recent postings with the enabled searches' keywords.
  const profileTitles = agent ? (getProfile(db)?.preferences.targetTitles ?? []) : []
  const searchTitles =
    agent && agentFile
      ? {
          titles: readSearchTitlesSafe(agentFile, profileTitles),
          profileTitles,
          samples: recentPostingTitles(agentFile, db),
          searchKeywords: (searches ?? []).filter((s) => s.enabled).map((s) => s.keywords),
        }
      : undefined
  const devices = isDemo() ? 0 : listSubscriptions(db).length
  const lastBackupFile = isDemo() ? null : latestAutoBackup(backupsDir())
  const lastBackup = lastBackupFile ? formatDay(lastBackupFile, locale) : null

  const dot = (tone: 'ok' | 'warn' | 'off') => (
    <span className={`status-dot tone-${tone}`} aria-hidden />
  )

  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="settings-page">
        <header className="settings-head">
          <h1 className="settings-h1">{t('settings.page.title')}</h1>
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
          {agent && (
            <SettingsRow
              label={
                <>
                  {dot(agent.settings.paused ? 'off' : 'ok')}
                  {t('settings.agent.title')}
                </>
              }
              hint={
                agent.settings.paused
                  ? t('settings.status.agentPaused')
                  : t('settings.status.agentOn')
              }
            />
          )}
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

        {agent && (
          <SettingsGroup title={t('settings.agent.title')} lede={t('settings.agent.lede')}>
            <AgentCard
              status={agent}
              kit={{ onChase: kitOnChase(), dailyCap: kitDailyCap() }}
              searches={searches}
              companies={companies}
              mail={mail}
              searchTitles={searchTitles}
              lastTick={
                agent.lastTriagedAt
                  ? new Intl.DateTimeFormat(localeTag(locale), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: serverTimeZone(),
                    }).format(new Date(agent.lastTriagedAt))
                  : undefined
              }
            />
          </SettingsGroup>
        )}

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

/** An older agent database without the table, or a busy one: Ajustes still renders. */
function readSearchesSafe(file: string) {
  try {
    return readSearches(file)
  } catch {
    return undefined
  }
}

/** null/undefined when the agent has not been restarted on a build with the table. */
function readCompaniesSafe(file: string) {
  try {
    return readCompanies(file)
  } catch {
    return undefined
  }
}

/** An agent database without a settings table, or a busy one: Ajustes still renders. */
function readSearchTitlesSafe(file: string, profileTitles: string[]): string[] {
  try {
    return readSearchTitles(file, profileTitles)
  } catch {
    return profileTitles
  }
}
