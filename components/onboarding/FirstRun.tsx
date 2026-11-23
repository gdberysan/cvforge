'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ImportReview } from '@/components/evidence/ImportReview'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { KeyGuide } from '@/components/settings/KeyGuide'
import { VerdictCard } from '@/components/triage/VerdictCard'
import { SAMPLE_VERDICTS } from '@/lib/onboarding/sample-verdicts'

/**
 * The first run. Before anything is asked of you, the answer you would get:
 * three real analyses for a made-up person, one tap apart. Then the wizard
 * (product spec §4.3) — the key, the CV, a first posting of your own — asked
 * for as the price of the same answer about *your* job.
 */
export function FirstRun({
  needsKey,
  local,
  privacyHref,
}: {
  needsKey: boolean
  local: boolean
  /** Where the privacy promises are written down, where there is a page for them. */
  privacyHref?: string
}) {
  const t = useT()
  const [step, setStep] = useState<'look' | 'key'>('look')

  if (!needsKey) {
    return (
      <main id="main" tabIndex={-1} className="page welcome">
        <WelcomeSteps at={2} label={t('start.importEyebrow')} />
        <h1 className="welcome-title">{t('start.title')}</h1>
        <p className="welcome-lede">{t('start.lede')}</p>
        <ImportReview />
      </main>
    )
  }

  const privacy = privacyHref ? (
    <Link href={privacyHref} className="welcome-link">
      {t('start.privacy')}
    </Link>
  ) : null

  if (step === 'look') return <FirstLook onStart={() => setStep('key')} privacy={privacy} />

  return (
    <main id="main" tabIndex={-1} className="page welcome">
      <WelcomeSteps at={1} label={t('start.keyEyebrow')} />
      <h1 className="welcome-title">{t('start.keyTitle')}</h1>
      <p className="welcome-lede">{t('start.keyLede')}</p>
      {/* The field first: it is what this screen is for. How to get a key
          sits under it, open, for someone who has none yet. */}
      <div className="welcome-card settings-rows">
        <ApiKeyForm hasSavedKey={false} envManaged={false} local={local} />
      </div>
      <KeyGuide open />
      <div className="welcome-links">
        <button type="button" className="welcome-link" onClick={() => setStep('look')}>
          {t('start.back')}
        </button>
        {privacy}
      </div>
    </main>
  )
}

function FirstLook({ onStart, privacy }: { onStart: () => void; privacy: React.ReactNode }) {
  const t = useT()
  const [picked, setPicked] = useState(SAMPLE_VERDICTS[0]?.id)
  const shown = SAMPLE_VERDICTS.find((s) => s.id === picked) ?? SAMPLE_VERDICTS[0]
  return (
    <main id="main" tabIndex={-1} className="page welcome first-look">
      <h1 className="welcome-title">{t('start.lookTitle')}</h1>
      <p className="welcome-lede">{t('start.lookLede')}</p>

      <div className="first-look-start">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          {t('start.lookCta')}
        </button>
        <p className="first-look-cost">{t('start.lookCost')}</p>
      </div>

      <section className="first-look-example" aria-labelledby="h-example">
        <h2 id="h-example" className="first-look-heading">
          {t('start.lookExample')}
        </h2>
        <p className="first-look-who">{t('start.lookWho')}</p>
        <fieldset className="first-look-picks" aria-label={t('start.lookExample')}>
          {SAMPLE_VERDICTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="first-look-pick"
              aria-pressed={s.id === shown?.id}
              onClick={() => setPicked(s.id)}
            >
              <span className="first-look-pick-title">{s.jobTitle}</span>
              <span className="first-look-pick-company">{s.company}</span>
            </button>
          ))}
        </fieldset>
        {shown && (
          <VerdictCard
            example
            company={shown.company}
            jobTitle={shown.jobTitle}
            coverage={shown.coverage}
            requirements={shown.requirements}
            mappings={shown.mappings}
            onSkip={() => {}}
            onSaveForLater={() => {}}
            onBuild={() => {}}
          />
        )}
      </section>

      <div className="welcome-links">{privacy}</div>
    </main>
  )
}

/** Three marks, filled up to this step, and the step in words. */
export function WelcomeSteps({ at, label }: { at: 1 | 2 | 3; label: string }) {
  return (
    <div className="welcome-steps">
      <div className="welcome-bar" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= at ? 'is-done' : undefined} />
        ))}
      </div>
      <p>{label}</p>
    </div>
  )
}
