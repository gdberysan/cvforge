import { getTranslate } from '@/lib/i18n/server'
import { SettingsRow } from './SettingsGroup'

/**
 * A plain download link, not a fetch+blob flow: the browser already knows
 * how to save a Content-Disposition attachment. One file, one click —
 * everything in the database, restorable by replacing datos/cvforge.db with
 * what gets downloaded.
 */
export async function BackupCard({ lastAuto }: { lastAuto: string | null }) {
  const { t } = await getTranslate()
  return (
    <SettingsRow
      label={t('settings.backup.title')}
      hint={
        lastAuto
          ? `${t('settings.backup.lede')} ${t('settings.backup.lastAuto', { date: lastAuto })}`
          : t('settings.backup.lede')
      }
    >
      <a href="/api/export/backup" className="btn btn-quiet">
        {t('settings.backup.download')}
      </a>
    </SettingsRow>
  )
}
