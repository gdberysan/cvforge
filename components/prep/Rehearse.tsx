'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { IconChevron, IconMic } from '@/components/ui/icons'
import { type Rehearsal, type RehearsalTarget, readRehearsal } from '@/lib/prep/rehearse'
import { Dictate } from './Dictate'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Say it out loud, against the clock, with the answer out of sight. What it
 * says back is read in code (time, figures landed or missed, figures the
 * prepared answer lacks, fillers): no model, no cost, the same every time.
 */
export function Rehearse({
  question,
  prepared,
  target,
  onActive,
  language,
}: {
  /** The language of the prepared answer: he rehearses in it. */
  language: 'es' | 'en'
  /** While he rehearses, the card hides the answer he prepared. */
  onActive?: (on: boolean) => void
  question: string
  /** The answer he prepared, the figures it holds and the length it's for. */
  prepared: string
  target: RehearsalTarget
}) {
  const t = useT()
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [said, setSaid] = useState('')
  // The text box is for checking figures; it waits behind a link.
  const [typing, setTyping] = useState(false)
  const [result, setResult] = useState<Rehearsal | null>(null)
  const started = useRef(0)
  // Pace in words is real only for speech heard live, not text typed later.
  const heard = useRef(false)

  useEffect(() => onActive?.(phase === 'running'), [phase, onActive])
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 250)
    return () => clearInterval(id)
  }, [phase])

  const start = () => {
    heard.current = false
    setSaid('')
    setResult(null)
    setSeconds(0)
    started.current = Date.now()
    setPhase('running')
  }
  const read = (text: string, s: number) => {
    const r = readRehearsal({
      seconds: s,
      transcript: text,
      prepared,
      target,
      language,
    })
    return heard.current ? r : { ...r, wpm: null }
  }
  const stop = () => {
    const s = Math.round((Date.now() - started.current) / 1000)
    setSeconds(s)
    setResult(read(said, s))
    setPhase('done')
  }

  if (phase === 'idle') {
    return (
      <button type="button" className="prep-rehearse-open" onClick={start}>
        <IconMic />
        {t('prep.rehearse.open')}
      </button>
    )
  }

  if (phase === 'running') {
    return (
      <section className="prep-rehearse is-running" aria-label={t('prep.rehearse.open')}>
        <p className="prep-rehearse-q">{question}</p>
        <p className="prep-rehearse-clock" aria-live="off">
          {clock(seconds)}
          <span className="prep-rehearse-goal">
            {t('prep.rehearse.goal', { min: clock(target.min), max: clock(target.max) })}
          </span>
        </p>
        {/* Above the field: on a phone the keyboard covers what is below it. */}
        <div className="prep-answer-actions">
          <button type="button" className="btn btn-primary" onClick={stop}>
            {t('prep.rehearse.stop')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPhase('idle')}>
            {t('prep.answer.cancel')}
          </button>
        </div>
        <Dictate
          language={language}
          onText={(text) => {
            heard.current = true
            setSaid((s) => (s ? `${s} ${text}` : text))
          }}
        />
        {/* What he is saying: dictated here when the browser can keep the
            voice local, or with the phone keyboard's own microphone. */}
        {!typing ? (
          <button type="button" className="prep-rehearse-typeopen" onClick={() => setTyping(true)}>
            {t('prep.rehearse.typeOpen')}
          </button>
        ) : (
          <>
            <label className="prep-muted" htmlFor={`saying-${question}`}>
              {t('prep.rehearse.saying')}
            </label>
            <AutoTextarea
              id={`saying-${question}`}
              className="field prep-rehearse-field"
              value={said}
              minRows={2}
              maxLength={3000}
              onChange={(e) => setSaid(e.target.value)}
            />
          </>
        )}
      </section>
    )
  }

  const r = result
  if (!r) return null
  // The bar runs a little past the band's end, or to his time if longer.
  const scale = Math.max(target.max * 1.25, r.seconds)
  return (
    <section className="prep-rehearse is-done" aria-live="polite">
      <p className="prep-beat-label">{t('prep.rehearse.result')}</p>
      {/* The headline: his time against the band it's meant for. */}
      <div className="prep-rehearse-length">
        <p className="prep-rehearse-time">
          <strong>{clock(r.seconds)}</strong>{' '}
          {t(`prep.rehearse.pace.${r.pace}`, { min: clock(target.min), max: clock(target.max) })}
        </p>
        <svg
          className="prep-rehearse-bar"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            className="prep-rehearse-track"
            x="0"
            y="4"
            width="100"
            height="8"
            rx="0.5"
            ry="4"
          />
          <rect
            className="prep-rehearse-band"
            x={(target.min / scale) * 100}
            y="4"
            width={((target.max - target.min) / scale) * 100}
            height="8"
            rx="0.5"
            ry="4"
          />
          <rect
            className={`prep-rehearse-mark${r.pace === 'good' ? ' is-good' : ''}`}
            x={Math.max(0, (Math.min(r.seconds, scale) / scale) * 100 - 0.6)}
            y="0"
            width="1.2"
            height="16"
          />
        </svg>
      </div>
      {/* What was heard, so every line below can be checked against it. */}
      {r.words > 0 && (
        <details className="prep-rehearse-heard">
          <summary>
            {t('prep.rehearse.heard')}
            <IconChevron />
          </summary>
          <p>{said}</p>
        </details>
      )}
      <ul className="prep-rehearse-list">
        {r.landed.length > 0 && (
          <li className="is-good">{t('prep.rehearse.landed', { figures: r.landed.join(', ') })}</li>
        )}
        {r.words > 0 && r.missed.length > 0 && (
          <li className="is-quiet">
            {t('prep.rehearse.missed', { figures: r.missed.join(', ') })}
          </li>
        )}
        {r.unprepared.length > 0 && (
          <li className="is-alert">
            {t('prep.rehearse.unprepared', { figures: r.unprepared.join(', ') })}
          </li>
        )}
        {r.fillers.reduce((n, f) => n + f.count, 0) >= 3 && (
          <li className="is-quiet">
            {t('prep.rehearse.fillers', {
              list: r.fillers
                .map((f) =>
                  t(f.count === 1 ? 'prep.rehearse.once' : 'prep.rehearse.times', {
                    word: f.word,
                    n: f.count,
                  }),
                )
                .join(', '),
            })}
          </li>
        )}
        {r.wpm !== null && r.wpm > 170 && <li className="is-quiet">{t('prep.rehearse.fast')}</li>}
      </ul>
      {r.words === 0 && (
        // No dictation: he can type or paste what he said to have it checked.
        <div className="prep-rehearse-type">
          <label className="prep-muted" htmlFor={`said-${question}`}>
            {t('prep.rehearse.typeHint')}
          </label>
          <AutoTextarea
            id={`said-${question}`}
            className="field"
            value={said}
            minRows={2}
            maxLength={3000}
            onChange={(e) => setSaid(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-quiet"
            disabled={said.trim() === ''}
            onClick={() => setResult(read(said, r.seconds))}
          >
            {t('prep.rehearse.check')}
          </button>
        </div>
      )}
      <div className="prep-answer-actions">
        <button type="button" className="btn btn-quiet" onClick={start}>
          {t('prep.rehearse.again')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPhase('idle')}>
          {t('prep.rehearse.close')}
        </button>
      </div>
    </section>
  )
}
