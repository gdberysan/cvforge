'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { skipApplicationAction } from '@/app/(app)/triage/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText, plural } from '@/lib/i18n'
import { sourceFromUrl } from '@/lib/posting-source'
import type { Coverage, EvidenceMapping, Market, Requirement } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'
import { VerdictCard } from './VerdictCard'

type Result = {
  applicationId: string
  cached: boolean
  company: string
  jobTitle: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}

/** Where you would actually be working. It decides whether a location,
 *  timezone or authorization line in the posting is a blocker or noise. */
const MARKETS: { value: Market; label: string }[] = [
  { value: 'mx', label: 'mx' },
  { value: 'us-remote', label: 'us-remote' },
  { value: 'eu-remote', label: 'eu-remote' },
]

export function TriageConsole({
  defaultMarket = 'mx',
  initialText = '',
  demoPostings,
  compact = false,
}: {
  defaultMarket?: Market
  /** Prefilled posting — the wizard's sample, or nothing. */
  initialText?: string
  /** Demo only: the seeded postings; the box becomes a chooser. */
  demoPostings?: { id: string; label: string; text: string }[]
  /** On a page whose job is a list (the pipeline): the box starts three rows
   *  tall and grows to the full height when it is focused or holds text. */
  compact?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [market, setMarket] = useState<Market>(defaultMarket)
  const [url, setUrl] = useState('')
  const [text, setText] = useState(initialText)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<{ name: string; detail?: string } | null>(null)
  const [triaged, setTriaged] = useState(0)
  const [focused, setFocused] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const verdictRef = useRef<HTMLDivElement>(null)

  // The verdict lands below the paste box, off-screen on most laptops. Without
  // this, clicking "Analyse" looks like nothing happened. Focus moves too:
  // the Analyse button unmounts with the result, and without a new home the
  // keyboard position falls to <body>.
  useEffect(() => {
    if (!result) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    verdictRef.current?.focus({ preventScroll: true })
    verdictRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    // The row is already persisted; any server-rendered list on this page
    // (the pipeline, the Today panel) should show it without a reload.
    router.refresh()
  }, [result, router])

  const canRun = text.trim().length >= 80

  /** The stages are the real ones emitted by runTriage, not a decorative timeline. */
  const stageCopy = (name?: string) =>
    name === 'extracting'
      ? t('triage.stage.extracting')
      : name === 'mapping'
        ? t('triage.stage.mapping')
        : name === 'saving'
          ? t('triage.stage.saving')
          : t('triage.stage.starting')

  async function analyse() {
    setRunning(true)
    setError(null)
    setStage(null)
    try {
      const trimmedUrl = url.trim()
      const res = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          market,
          // Read off the host, so it is not a second thing to state by hand
          // after pasting the link.
          source: trimmedUrl ? sourceFromUrl(trimmedUrl) : undefined,
          // Undefined, never '': the route validates this with z.string().url(),
          // so an empty string would fail the whole request and cost a paste
          // its analysis over a field the user deliberately left blank.
          sourceUrl: trimmedUrl || undefined,
        }),
      })

      // A cached hit answers as plain JSON; a fresh run streams its stages.
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json()
        if (!res.ok) throw new ApiFailure(data.error, data.code)
        setResult(data)
        setTriaged((n) => n + 1)
        return
      }

      await readEventStream(res.body, (event) => {
        if (event.done) {
          setResult(event as unknown as Result)
          setTriaged((n) => n + 1)
        } else if (typeof event.stage === 'string') {
          setStage({ name: event.stage, detail: event.detail as string | undefined })
        }
      })
    } catch (e) {
      // Known codes render in the UI language; anything else shows the
      // server's own words rather than nothing.
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('triage.failed'),
      )
    } finally {
      setRunning(false)
      setStage(null)
    }
  }

  /** Straight back to an empty box: fifteen postings should feel like triage. */
  function next() {
    setResult(null)
    setText('')
    setUrl('')
    setError(null)
    requestAnimationFrame(() => boxRef.current?.focus())
  }

  /** Skip means skip: the row is archived out of the pipeline, not left to
   *  pile up as junk indistinguishable from the postings being pursued. */
  async function skip() {
    if (!result) return
    try {
      // Refusals arrive as {ok:false} (the demo guard's shape), not throws —
      // clearing the card on one would read as a successful archive.
      const res = await skipApplicationAction(result.applicationId)
      if (!res.ok) {
        setError(errorText(t, res.code, res.error))
        return
      }
    } catch {
      setError(t('triage.skipFailed'))
      return
    }
    next()
  }

  // The current in the frame: a slow, faint trace while the box waits for a
  // paste, a fast bright one while the machine works, none once it has
  // answered. Purely a state of the console; the SVG is decoration.
  const live = result ? undefined : running ? 'is-running' : 'is-idle'
  const expanded = !compact || focused || text.length > 0

  return (
    <div>
      <div className={['console', 'console-live', live].filter(Boolean).join(' ')}>
        {live && (
          <svg className="console-trace" aria-hidden="true" focusable="false">
            <rect className="console-trace-tail" pathLength="100" />
            <rect className="console-trace-head" pathLength="100" />
          </svg>
        )}
        <p className="console-line">
          <span className="console-sigil">$</span>
          <span className="cmd-token">cvforge triage --posting</span>
          {/* The one setting that changes the answer, written as what it is:
              a flag on the command. A form control above the box would be a
              second thing to look at before you have even pasted anything. */}
          <label
            className="cmd-token"
            style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}
          >
            <span style={{ color: 'var(--text-faint)' }}>--market</span>
            <span className="sr-only">{t('triage.market.label')}</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as Market)}
              disabled={running || Boolean(result)}
              className="flag-select"
              // A <select> sizes itself to its widest option, which left the
              // underline running on past a short value like "mx".
              style={{ width: `${market.length + 1}ch` }}
            >
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {/* Second flag on the same command line, for the same reason --market
              is one: the link is a fact about the posting, not a form to fill
              in. Keeping it here means the URL is captured at the one moment
              it is still on the clipboard. */}
          <label
            className="cmd-token"
            style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}
          >
            <span style={{ color: 'var(--text-faint)' }}>--url</span>
            <span className="sr-only">{t('triage.url.label')}</span>
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={running || Boolean(result)}
              placeholder={t('triage.url.placeholder')}
              className="flag-input"
            />
          </label>
          {running && <span className="cursor" aria-hidden />}
        </p>

        {!result && demoPostings && demoPostings.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <p className="fact" style={{ color: 'var(--text-muted)' }}>
              {t('demo.choose')}
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
                marginTop: 'var(--space-2)',
              }}
            >
              {demoPostings.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-quiet"
                  aria-pressed={text === p.text}
                  onClick={() => setText(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!result && (
          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // `!running` mirrors the button's disabled state: a second
              // Cmd+Enter mid-run fired a second paid analysis and, both
              // passing the posting-hash check before either wrote, created
              // duplicate application rows.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canRun && !running) analyse()
            }}
            rows={expanded ? 12 : 3}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // biome-ignore lint/a11y/noAutofocus: this page exists to receive a paste
            autoFocus={!compact}
            readOnly={Boolean(demoPostings?.length)}
            title={demoPostings?.length ? t('demo.readOnlyBox') : undefined}
            placeholder={t('triage.placeholder')}
            aria-label={t('triage.aria')}
            className="field-bare"
            // No resize grabber: the console is the frame, and a drag handle
            // inside it breaks the one thing this screen is trying to be.
            style={{ marginTop: 'var(--space-4)', font: 'var(--type-mono)', resize: 'none' }}
          />
        )}

        {/* Muted, not faint: this line is live feedback during a 30-second
            run, so it has to clear the small-text contrast floor. */}
        <p
          className="console-line"
          aria-live="polite"
          style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}
        >
          <span aria-hidden>&gt;</span>
          <span>
            {running && stageCopy(stage?.name)}
            {running && stage?.detail && `  ·  ${stage.detail}`}
            {!running && result && `${result.jobTitle} @ ${result.company}`}
            {!running && !result && canRun && t('triage.ready')}
            {!running && !result && !canRun && t('triage.waiting')}
          </span>
          {result?.cached && <span>{t('triage.cached')}</span>}
        </p>

        {triaged > 0 && (
          <p className="fact" style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)' }}>
            {plural(t, triaged, 'triage.session')}
          </p>
        )}
      </div>

      {error && (
        // role="alert" so the failure is announced — the aria-live status
        // line above goes quiet on error, and silence reads as a hang.
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      {!result && (
        <button
          type="button"
          onClick={analyse}
          disabled={running || !canRun}
          className="btn btn-primary"
          style={{ marginTop: 'var(--space-5)' }}
        >
          {running ? t('triage.running') : t('triage.run')}
        </button>
      )}

      {result && (
        // 88px clears the sticky nav, which would otherwise cover the blocker
        // box — the one thing on the card that must be read first.
        <div ref={verdictRef} tabIndex={-1} style={{ scrollMarginTop: 88, outline: 'none' }}>
          <VerdictCard
            company={result.company}
            jobTitle={result.jobTitle}
            coverage={result.coverage}
            requirements={result.requirements}
            mappings={result.mappings}
            onSkip={skip}
            // The row is already persisted as `triaged`, so saving for later
            // is exactly: leave it in the pipeline and move on.
            onSaveForLater={next}
            onBuild={() => router.push(`/application/${result.applicationId}`)}
          />
        </div>
      )}
    </div>
  )
}
