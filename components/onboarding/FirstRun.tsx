'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ImportReview } from '@/components/evidence/ImportReview'
import { useT } from '@/components/i18n/LocaleProvider'
import { KeyJourney } from '@/components/settings/KeyJourney'
import { VerdictCard } from '@/components/triage/VerdictCard'
import { IconArrow } from '@/components/ui/icons'
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
  landingHref,
  trial,
}: {
  needsKey: boolean
  local: boolean
  /** Where the privacy promises are written down, where there is a page for them. */
  privacyHref?: string
  /** Where the example already lives (the web edition's landing page): the first
   *  run then opens on the key, and "back to the example" goes there. */
  landingHref?: string
  /** The web edition's free trial: offered first, the key below it. */
  trial?: React.ReactNode
}) {
  const t = useT()
  // Whoever arrives from the landing page has seen the example: one press, not two.
  const [step, setStep] = useState<'look' | 'key'>(landingHref ? 'key' : 'look')

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
    <main id="main" tabIndex={-1} className={`page welcome welcome-key${trial ? ' is-trial' : ''}`}>
      {/* On a wide screen, the field on the left and how to get a key beside
          it; on a phone, one under the other. */}
      <div className="welcome-main">
        <WelcomeSteps at={1} label={t('start.keyEyebrow')} />
        {trial ? (
          <>
            {/* The free trial first: no key to get before seeing it work on
                your own CV. The key is the way to keep going. */}
            <h1 className="welcome-title">
              {t('start.trialTitle')} <em>{t('start.trialTitleEnd')}</em>
            </h1>
            <p className="welcome-lede">{t('start.trialLede')}</p>
            {trial}
          </>
        ) : (
          <>
            <h1 className="welcome-title">{t('start.keyTitle')}</h1>
            <p className="welcome-lede">{t('start.keyLede')}</p>
          </>
        )}
      </div>
      {/* Getting a key, step by step, ending in the field itself: beside the
          trial on a wide screen; under it, folded, on a phone. */}
      <KeyJourney local={local} open={!trial} quiet={Boolean(trial)} />
      <div className="welcome-links">
        {landingHref ? (
          // The landing page is outside the app (its own page at the site root).
          <a href={landingHref} className="welcome-link">
            {t('start.back')}
          </a>
        ) : (
          <button type="button" className="welcome-link" onClick={() => setStep('look')}>
            {t('start.back')}
          </button>
        )}
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
      {/* The landing's hero: the promise and the button on the left, the
          answer itself on the right. */}
      <div className="first-look-intro">
        <h1 className="welcome-title">
          {t('start.lookTitle')} <em>{t('start.lookTitleEnd')}</em>
        </h1>
        <p className="welcome-lede">{t('start.lookLede')}</p>
        <div className="first-look-start">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {t('start.lookCta')}
            <IconArrow />
          </button>
          <p className="first-look-cost">{t('start.lookCost')}</p>
        </div>
        <div className="welcome-links">{privacy}</div>
      </div>

      <section className="first-look-example" aria-labelledby="h-example">
        <h2 id="h-example" className="first-look-heading">
          {t('start.lookExample')}
        </h2>
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
        <p className="first-look-who">{t('start.lookWho')}</p>
      </section>
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
