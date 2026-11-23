'use client'

import { useT } from '@/components/i18n/LocaleProvider'

/**
 * The reassurance is the feature (product spec §4.2): three steps, and what
 * it costs in the author's measured numbers. Folded by default — someone with
 * a key does not need the how-to every visit — and open on the first run,
 * where nobody has one yet.
 */
export function KeyGuide({ open = false }: { open?: boolean }) {
  const t = useT()
  const steps = [t('guide.step1'), t('guide.step2'), t('guide.step3')]
  return (
    <details className="key-guide" open={open}>
      <summary className="key-guide-summary">{t('guide.title')}</summary>
      <ol className="key-guide-steps">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <a
        className="action"
        href="https://console.anthropic.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('guide.open')}
      </a>
      <p className="key-guide-cost">{t('guide.cost')}</p>
    </details>
  )
}
