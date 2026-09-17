import { ImportReview } from '@/components/evidence/ImportReview'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { getTranslate } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const { t } = await getTranslate()
  // With a profile on file, accepting a new import is destructive and takes
  // a second, explicit click.
  const hasProfile = Boolean(getProfile(db))

  // The same shape as the first-run import screen: intro beside the working
  // column instead of a single narrow stack.
  return (
    <main className="page">
      <div className="hero">
        <div className="hero-intro">
          <p className="eyebrow">{t('import.eyebrow')}</p>
          <h1 style={{ font: 'var(--type-h1)', marginTop: 'var(--space-4)' }}>
            {t('import.title')}
          </h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            {t('import.lede')}
          </p>
          {hasProfile && (
            // The contract, stated before the parse is paid for — not only at
            // the accept step's armed confirm.
            <p
              className="prose"
              style={{ marginTop: 'var(--space-3)', font: 'var(--type-body-sm)' }}
            >
              {t('import.reimportNote')}
            </p>
          )}
        </div>
        <ImportReview hasProfile={hasProfile} />
      </div>
    </main>
  )
}
