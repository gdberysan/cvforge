'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { IconArrow, IconCheck, IconChevron, IconExternal } from '@/components/ui/icons'
import type { MessageKey } from '@/lib/i18n'

/**
 * Getting your own key, as four short steps instead of a wall: an account,
 * some credit, a key, and pasting it here. Each step shows, before you leave
 * for Anthropic's site, what you will see there (an illustration using the
 * console's own words, in your language), opens the right page in a new tab,
 * and asks "¿Listo?" when you come back. The last step is the key field
 * itself: paste and it is checked (free) and saved. Where you are is kept in
 * this browser, so leaving halfway resumes at the same step.
 *
 * The console's labels below are the ones platform.claude.com shows
 * (checked 2026-11-24, Spanish and English): "Claves de API" / "API keys",
 * "Crear clave" / "Create key", "Facturación" / "Billing", "Comprar créditos"
 * / "Buy credits". If Anthropic renames them, update journey.ill.*.
 */
const STEPS = [
  { id: 'account', url: 'https://platform.claude.com/' },
  { id: 'credit', url: 'https://platform.claude.com/settings/billing' },
  { id: 'key', url: 'https://platform.claude.com/settings/keys' },
  { id: 'paste', url: null },
] as const
type StepId = (typeof STEPS)[number]['id']

const STORE = 'rumbo-key-journey'
/** A full kit (analysis, CV, letter, answers, message) on Opus, measured 2026-11-24. */
const KIT_USD = 0.75
const BUDGETS = [5, 10, 20] as const

function readStep(): number {
  try {
    const n = Number(localStorage.getItem(STORE))
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0
  } catch {
    return 0
  }
}

export function KeyJourney({
  local,
  open = true,
  bare = false,
  openOnWide = false,
  quiet = false,
  onConnected,
  next,
}: {
  local: boolean
  open?: boolean
  /** Inside a group that already titles it (Ajustes): no frame, no heading of its own. */
  bare?: boolean
  /** Folded on a phone but open on a wide screen, where it has its own column. */
  openOnWide?: boolean
  /** Beside a stronger first action (the free trial): its buttons step down a weight. */
  quiet?: boolean
  /** Told when the key is saved, so the page can keep this moment on screen. */
  onConnected?: () => void
  /** Where the success moment leads; none where the page moves on by itself. */
  next?: { href: string; label: string }
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(open)
  const [at, setAt] = useState(0)
  const [away, setAway] = useState(false)
  const [back, setBack] = useState(false)
  const [connected, setConnected] = useState(false)
  /** The saved key's last characters, so the success says which key it was. */
  const [savedTail, setSavedTail] = useState('')
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]>(5)
  const body = useRef<HTMLDivElement>(null)
  const self = useRef<HTMLElement>(null)

  useEffect(() => setAt(readStep()), [])
  useEffect(() => {
    if (openOnWide && window.matchMedia?.('(min-width: 960px)').matches) setExpanded(true)
  }, [openOnWide])
  // Sent here by "Conectar mi clave" (#clave): the page draws after the
  // browser's own jump to the anchor, so bring the journey into view.
  useEffect(() => {
    // The group that titles it, when there is one, so its heading shows too
    // (scroll-margin keeps it clear of the sticky bar).
    if (location.hash === '#clave')
      requestAnimationFrame(() =>
        (self.current?.closest('#clave') ?? self.current)?.scrollIntoView({ block: 'start' }),
      )
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORE, String(at))
    } catch {
      // A per-browser convenience only.
    }
  }, [at])

  // Back from Anthropic's tab: ask, don't assume the step is done.
  useEffect(() => {
    if (!away) return
    const onShow = () => {
      if (document.visibilityState === 'visible') setBack(true)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [away])

  function go(n: number) {
    setAt(n)
    setAway(false)
    setBack(false)
    // Keep the new step in view on a phone, where the card is tall.
    requestAnimationFrame(() =>
      body.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  }

  const step = STEPS[at]
  const k = (name: string) => `journey.${step.id}.${name}` as MessageKey

  if (!expanded) {
    return (
      <div className="journey is-folded">
        <button
          type="button"
          className="journey-open"
          aria-expanded={false}
          onClick={() => {
            setExpanded(true)
            requestAnimationFrame(() =>
              self.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
            )
          }}
        >
          <span className="journey-open-text">
            <span className="journey-open-title">{t('journey.title')}</span>
            <span className="journey-open-sub">
              {t(quiet ? 'journey.subAfterTrial' : 'journey.sub')}
            </span>
          </span>
          <span className="journey-open-chevron" aria-hidden="true">
            <IconChevron />
          </span>
        </button>
      </div>
    )
  }

  const fold = !open && !connected && (
    <button type="button" className="journey-fold" onClick={() => setExpanded(false)}>
      {t('journey.fold')}
    </button>
  )

  return (
    <section
      ref={self}
      className={`journey${bare ? ' is-bare' : ''}`}
      aria-labelledby={bare ? undefined : 'journey-title'}
      aria-label={bare ? t('journey.title') : undefined}
    >
      {!bare && fold}
      {bare ? (
        !connected && (
          // In a card of its own (the trial's), the fold shares this line: it
          // sits in the flow, so it can never cover what the card shows above.
          <div className="journey-bare-head">
            <p className="journey-sub">{t(quiet ? 'journey.subAfterTrial' : 'journey.sub')}</p>
            {fold}
          </div>
        )
      ) : (
        <header className="journey-head">
          <h2 id="journey-title" className="journey-title">
            {t('journey.title')}
          </h2>
          {!connected && (
            <p className="journey-sub">{t(quiet ? 'journey.subAfterTrial' : 'journey.sub')}</p>
          )}
        </header>
      )}

      {!connected && (
        <ol className="journey-steps">
          {STEPS.map((s, i) => {
            const done = connected || i < at
            const now = !connected && i === at
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`journey-dot${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}
                  aria-current={now ? 'step' : undefined}
                  disabled={connected}
                  onClick={() => go(i)}
                >
                  <span className="journey-dot-mark" aria-hidden="true">
                    {done ? <IconCheck /> : i + 1}
                  </span>
                  <span className="journey-dot-label">
                    {t(`journey.${s.id}.short` as MessageKey)}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span
                    className={`journey-line${connected || i < at ? ' is-filled' : ''}`}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}
      {/* On a narrow card only the current step keeps its name: say what comes next. */}
      {!connected && at < STEPS.length - 1 && (
        <p className="journey-next">
          {t('journey.nextStep', {
            step: t(`journey.${STEPS[at + 1].id}.short` as MessageKey),
          })}
        </p>
      )}

      {connected ? (
        <div className="journey-done" role="status">
          {!bare && (
            <div className="journey-done-head">
              <span className="journey-done-mark" aria-hidden="true">
                <IconCheck />
              </span>
              <h3 className="journey-step-title">{t('journey.done.title')}</h3>
            </div>
          )}
          <p className="journey-step-body">{t('journey.done.body')}</p>
          {next && (
            <Link href={next.href} className="btn btn-primary journey-done-next">
              {next.label}
            </Link>
          )}
          <div className="journey-done-key">
            <span className="journey-done-key-text">
              {t('journey.done.saved')}{' '}
              <span className="journey-done-key-value">sk-ant-…{savedTail}</span>
            </span>
            <button
              type="button"
              className="journey-skip"
              onClick={() => {
                setConnected(false)
                go(STEPS.length - 1)
              }}
            >
              {t('journey.done.change')}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`journey-body${step.id === 'paste' ? ' is-solo' : ''}`}
          ref={body}
          aria-live="polite"
        >
          {/* The last step is the real field: no drawing of a field beside it. */}
          {step.id !== 'paste' && <Illustration step={step.id} />}
          <div className="journey-text">
            <h3 className="journey-step-title">{t(k('title'))}</h3>
            <p className="journey-step-body">{t(k('body'))}</p>

            {step.id === 'credit' && (
              <div className="journey-calc">
                <p className="journey-calc-title" id="journey-calc-title">
                  {t('journey.calc.label')}
                </p>
                <div
                  className="journey-calc-chips"
                  role="radiogroup"
                  aria-labelledby="journey-calc-title"
                >
                  {BUDGETS.map((usd) => (
                    // biome-ignore lint/a11y/useSemanticElements: a chip row; a native radio group would need its chrome reset for the same reading
                    <button
                      key={usd}
                      type="button"
                      role="radio"
                      aria-checked={budget === usd}
                      className="journey-chip"
                      onClick={() => setBudget(usd)}
                    >
                      US${usd}
                    </button>
                  ))}
                </div>
                <p className="journey-calc-out">
                  <span className="journey-calc-n">
                    ≈ {Math.floor(budget / KIT_USD)} {t('journey.calc.out')}
                  </span>
                  <span className="journey-calc-label">{t('journey.calc.detail')}</span>
                </p>
              </div>
            )}

            {/* The one note that costs a redo if missed is read before leaving. */}
            {step.id === 'key' && <p className="journey-tip is-warn">{t(k('tip'))}</p>}
            {step.url ? (
              back ? (
                <div className="journey-back" role="status">
                  <p>{t(k('back'))}</p>
                  <div className="journey-actions">
                    <button type="button" className="btn btn-primary" onClick={() => go(at + 1)}>
                      {t('journey.yes')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setBack(false)}>
                      {t('journey.notYet')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="journey-actions">
                  <a
                    className={`btn ${quiet ? 'btn-quiet' : 'btn-primary'} icon-label`}
                    href={step.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAway(true)}
                  >
                    {t(k('open'))}
                    <IconExternal />
                  </a>
                  {!quiet && (
                    <button type="button" className="btn btn-quiet" onClick={() => go(at + 1)}>
                      {t(k('done'))}
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="journey-paste settings-rows">
                <ApiKeyForm
                  hasSavedKey={false}
                  envManaged={false}
                  local={local}
                  recover={{ href: STEPS[2].url, label: t('journey.paste.newKey') }}
                  idleNote={t('journey.paste.tip')}
                  onSaved={(saved) => {
                    setSavedTail(saved.slice(-4))
                    setConnected(true)
                    try {
                      localStorage.removeItem(STORE)
                    } catch {
                      // A per-browser convenience only.
                    }
                    onConnected?.()
                  }}
                />
              </div>
            )}

            {step.id !== 'paste' && step.id !== 'key' && (
              <p className="journey-tip">{t(k('tip'))}</p>
            )}
            {/* Beside the trial the "done" answer is a quiet link, after the
                note that belongs to the button above it. */}
            {quiet && step.url && !back && (
              <button type="button" className="journey-skip is-answer" onClick={() => go(at + 1)}>
                {t(k('done'))}
              </button>
            )}
            {step.id === 'paste' && (
              <button type="button" className="journey-skip is-lost" onClick={() => go(2)}>
                {t('journey.paste.lost')}
              </button>
            )}
            {at === 0 && (
              <button
                type="button"
                className="journey-skip icon-label"
                onClick={() => go(STEPS.length - 1)}
              >
                {t('journey.haveKey')}
                <IconArrow />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * What the person will see at Anthropic, drawn small and animated: a cursor
 * goes to the button they will press. The labels are the console's own.
 */
function Illustration({ step }: { step: StepId }) {
  const t = useT()
  const label = (name: string) => t(`journey.ill.${name}` as MessageKey)
  return (
    <div className={`journey-ill is-${step}`} aria-hidden="true">
      <svg viewBox="0 0 300 190" width="100%" focusable="false" aria-hidden="true">
        <rect className="ill-window" x="1" y="1" width="298" height="188" rx="14" />
        <path className="ill-bar" d="M1 15a14 14 0 0 1 14-14h270a14 14 0 0 1 14 14v13H1z" />
        <circle className="ill-light" cx="16" cy="15" r="3.5" />
        <circle className="ill-light" cx="28" cy="15" r="3.5" />
        <circle className="ill-light" cx="40" cy="15" r="3.5" />
        <rect className="ill-address" x="96" y="8" width="150" height="14" rx="7" />

        {step === 'account' && (
          <g>
            <text className="ill-h" x="150" y="64" textAnchor="middle">
              {label('signup')}
            </text>
            <rect className="ill-btn is-target" x="50" y="80" width="200" height="34" rx="17" />
            <text className="ill-btn-text is-on" x="150" y="102" textAnchor="middle">
              {label('google')}
            </text>
            <rect className="ill-btn" x="50" y="124" width="200" height="34" rx="17" />
            <text className="ill-btn-text" x="150" y="146" textAnchor="middle">
              {label('email')}
            </text>
          </g>
        )}

        {(step === 'credit' || step === 'key') && (
          <g>
            <path className="ill-side" d="M1 28h124v161H15a14 14 0 0 1-14-14z" />
            <rect className="ill-side-row is-on" x="8" y="40" width="110" height="26" rx="8" />
            <text className="ill-side-text is-on" x="18" y="58">
              {label(step === 'credit' ? 'billing' : 'keys')}
            </text>
            <rect className="ill-side-row" x="14" y="80" width="70" height="8" rx="4" />
            <rect className="ill-side-row" x="14" y="98" width="80" height="8" rx="4" />
          </g>
        )}

        {step === 'credit' && (
          <g>
            <text className="ill-h" x="138" y="56">
              {label('balance')}
            </text>
            <text className="ill-money is-before" x="138" y="94">
              US$0.00
            </text>
            <text className="ill-money is-after" x="138" y="94">
              US$5.00
            </text>
            <rect className="ill-btn is-target" x="138" y="122" width="150" height="34" rx="17" />
            <text className="ill-btn-text is-on" x="213" y="144" textAnchor="middle">
              {label('buy')}
            </text>
          </g>
        )}

        {step === 'key' && (
          <g>
            <rect className="ill-btn is-target" x="138" y="40" width="150" height="34" rx="17" />
            <text className="ill-btn-text is-on" x="213" y="62" textAnchor="middle">
              {label('create')}
            </text>
            <g className="ill-key">
              <rect className="ill-field" x="138" y="104" width="150" height="38" rx="10" />
              <text className="ill-key-text" x="150" y="128">
                sk-ant-••••
              </text>
              <rect className="ill-copy" x="258" y="112" width="22" height="22" rx="6" />
              <path className="ill-copy-glyph" d="M265 120h7v9h-7zM268 117h7v9" />
            </g>
          </g>
        )}

        {step === 'paste' && (
          <g>
            <text className="ill-h" x="150" y="64" textAnchor="middle">
              Rumbo
            </text>
            <rect className="ill-field" x="40" y="80" width="220" height="40" rx="10" />
            <text className="ill-key-text ill-typing" x="56" y="105">
              sk-ant-•••••••
            </text>
          </g>
        )}

        <g className={`ill-cursor is-${step}`}>
          <path d="M0 0 L0 18 L5 13.5 L9 21 L12 19.8 L8 12.4 L14.6 12.4 Z" />
        </g>
      </svg>
    </div>
  )
}
