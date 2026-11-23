'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/components/i18n/LocaleProvider'
import { type Moment, onMoment } from '@/lib/ui/moment'

/** Confetti pieces: fixed positions and timings, so every run looks the same. */
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${((i * 53) % 92) + 4}%`,
  wide: i % 3 !== 0,
  tone: ['warm', 'missing', 'ink', 'strong'][i % 4],
  dur: `${1400 + (i % 5) * 180}ms`,
  delay: `${300 + ((i * 37) % 420)}ms`,
}))

/**
 * Shows a moment (lib/ui/moment.ts) over the page: a printed picture, one
 * line, one sentence, one way on. A tap anywhere, Escape or the button
 * closes it; it never blocks the toast's undo underneath.
 */
export function MomentHost() {
  const t = useT()
  const [moment, setMoment] = useState<Moment | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => onMoment(setMoment), [])
  useEffect(() => {
    if (!moment) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoment(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moment])

  if (!moment) return null
  const { kind, applicationId } = moment
  const close = () => setMoment(null)
  const cta =
    kind === 'sent'
      ? { href: '/' }
      : kind === 'interview'
        ? { href: `/application/${applicationId}?step=prep` }
        : kind === 'loss'
          ? { href: '/' }
          : null

  // On the body itself: inside the app shell's stacking layer it could not
  // cover the phone's bottom bar.
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the Close button are the keyboard way
    // biome-ignore lint/a11y/noStaticElementInteractions: a tap on the backdrop dismisses it
    <div className="moment-scrim" onClick={close}>
      <div
        className={`moment moment-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moment-title"
      >
        <div className="moment-art" aria-hidden>
          {kind === 'sent' && (
            <>
              <svg className="moment-trail" viewBox="0 0 342 240" fill="none" aria-hidden="true">
                <path d="M24 208C96 184 120 128 180 118s92 18 130-62" />
              </svg>
              <svg className="moment-plane" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 11l18-8-6 18-3-7-9-3z" />
                <path d="M12 14l9-11" />
              </svg>
            </>
          )}
          {(kind === 'interview' || kind === 'offer') &&
            CONFETTI.map((c) => (
              <span
                key={c.left + c.delay}
                className={`moment-confetti tone-${c.tone}${c.wide ? ' is-wide' : ''}`}
                style={{ left: c.left, animationDuration: c.dur, animationDelay: c.delay }}
              />
            ))}
          {kind !== 'sent' && (
            <span className={`moment-stamp${kind === 'loss' ? ' is-loss' : ''}`}>
              {t(`moment.${kind}.stamp`)}
            </span>
          )}
        </div>
        <h2 id="moment-title" className="moment-title">
          {t(`moment.${kind}.title`)}
        </h2>
        <p className="moment-body">{t(`moment.${kind}.body`)}</p>
        <div className="moment-actions">
          {/* With somewhere to go, the way on and a way out. Without one (an
              offer: you are already where it is decided) one button, not
              two that do the same thing. */}
          {cta ? (
            <>
              <Link href={cta.href} className="btn btn-primary" onClick={close}>
                {t(`moment.${kind}.cta`)}
              </Link>
              <button ref={closeRef} type="button" className="btn btn-quiet" onClick={close}>
                {t('moment.close')}
              </button>
            </>
          ) : (
            <button ref={closeRef} type="button" className="btn btn-primary" onClick={close}>
              {t(`moment.${kind}.cta`)}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
