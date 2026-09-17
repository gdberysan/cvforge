import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { BackupCard } from '@/components/settings/BackupCard'
import { KeyGuide } from '@/components/settings/KeyGuide'
import { PdfEngineSetup } from '@/components/settings/PdfEngineSetup'
import { RestoreCard } from '@/components/settings/RestoreCard'
import { UpdateToggle } from '@/components/settings/UpdateToggle'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { isPdfEngineAvailable } from '@/lib/render/pdf'
import { readSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { t } = await getTranslate()
  const hasSavedKey = Boolean(readSettings().anthropicApiKey)
  const envManaged = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  // Self-hiding friction: the install offer exists only for the machine with
  // no Chrome, no Edge and no downloaded Chromium. Everyone else never sees
  // the question. (Probed once per process; cached after the first visit.
  // The demo serves pre-rendered PDFs, so it never needs the offer.)
  const pdfReady = isDemo() || (await isPdfEngineAvailable())

  // The same shape as the first-run key screen: intro beside the working
  // column, so a wide window is used instead of stacking everything into
  // one narrow strip.
  return (
    <main className="page">
      <div className="hero">
        <div className="hero-intro">
          <p className="eyebrow">{t('settings.eyebrow')}</p>
          <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
            {t('settings.title')}
          </h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            {t('settings.lede')}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          <ApiKeyForm hasSavedKey={hasSavedKey} envManaged={envManaged} />
          <KeyGuide />
          {!pdfReady && <PdfEngineSetup />}
          <UpdateToggle enabled={readSettings().updateCheck ?? false} />
          <BackupCard />
          <RestoreCard />
        </div>
      </div>
    </main>
  )
}
