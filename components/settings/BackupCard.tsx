import { getTranslate } from '@/lib/i18n/server'

/**
 * A plain download link, not a fetch+blob flow: the browser already knows
 * how to save a Content-Disposition attachment, and there's no 503-style
 * fallback branch to handle here the way PDF export has. One file, one
 * click — everything in the database, restorable by replacing
 * datos/cvforge.db with what gets downloaded.
 */
export async function BackupCard() {
  const { t } = await getTranslate()
  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '36em' }}>
      <p className="fact-label">{t('settings.backup.title')}</p>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
        {t('settings.backup.lede')}
      </p>
      <a href="/api/export/backup" className="btn btn-quiet" style={{ justifySelf: 'start' }}>
        {t('settings.backup.download')}
      </a>
    </section>
  )
}
