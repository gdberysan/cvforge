'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { skipApplicationAction } from '@/app/(app)/triage/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { MarketOptions } from '@/components/ui/MarketOptions'
import { ApiFailure } from '@/lib/api-failure'
import { errorText, plural } from '@/lib/i18n'
import { marketLabel } from '@/lib/markets'
import { sourceFromUrl } from '@/lib/posting-source'
import type { Coverage, EvidenceMapping, Market, Requirement, Source } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'
import { haptic } from '@/lib/ui/haptics'
import { VerdictCard } from './VerdictCard'

/** A link from outside, only if it is a web page (never javascript: or data:). */
function webLink(raw: string): string {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
  } catch {
    return ''
  }
}

type Result = {
  applicationId: string
  cached: boolean
  company: string
  jobTitle: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}

export function TriageConsole({
  defaultMarket = 'us-remote',
  ownMarkets = [],
  initialText = '',
  initialSource,
  initialSourceUrl,
  demoPostings,
  compact = false,
  title,
  secondary,
  footer,
  posting,
}: {
  /** Where you would actually be working. It decides whether a location,
   *  timezone or authorization line in the posting is a blocker or noise. */
  defaultMarket?: Market
  /** The profile's markets, offered first. */
  ownMarkets?: readonly Market[]
  /** Prefilled posting — the wizard's sample, or nothing. */
  initialText?: string
  /** Discover handoff: recorded on the application, defaulted by the API otherwise. */
  initialSource?: Source
  initialSourceUrl?: string
  /** Demo only: the seeded postings; the box becomes a chooser. */
  demoPostings?: { id: string; label: string; text: string }[]
  /** On a page whose job is a list (the pipeline): the box starts three rows
   *  tall and grows to the full height when it is focused or holds text. */
  compact?: boolean
  /** A heading inside the card ("A new posting"), where the page has none. */
  title?: string
  /** A second way in beside Analyse — the web edition's screenshots. */
  secondary?: React.ReactNode
  /** Quiet help at the bottom of the card (hints, the sample link). */
  footer?: React.ReactNode
  /** A job already read in parts (the browser extension): shown as the job
   *  itself, its text one tap away for checking or editing. */
  posting?: { title: string; company: string; location: string; url: string; body: string }
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [market, setMarket] = useState<Market>(defaultMarket)
  const [url, setUrl] = useState(initialSourceUrl ?? '')
  // The discover handoff names the source once; the next posting pasted
  // into this same box must not inherit it (nor the previous link).
  const [source, setSource] = useState(initialSource)
  const [text, setText] = useState(initialText)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<{ name: string; detail?: string } | null>(null)
  const [triaged, setTriaged] = useState(0)
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState(false)
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
          // A caller that already knows the source (the /discover handoff) wins;
          // otherwise it is read off the host, so it is not a second thing to
          // state by hand after pasting the link.
          source: source ?? (trimmedUrl ? sourceFromUrl(trimmedUrl) : undefined),
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
        haptic('done')
        return
      }

      await readEventStream(res.body, (event) => {
        if (event.done) {
          setResult(event as unknown as Result)
          setTriaged((n) => n + 1)
          haptic('done')
        } else if (typeof event.stage === 'string') {
          setStage({ name: event.stage, detail: event.detail as string | undefined })
        }
      })
    } catch (e) {
      haptic('failed')
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
    setSource(undefined)
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

  const expanded = !compact || focused || text.length > 0
  const status = running
    ? `${stageCopy(stage?.name)}${stage?.detail ? `  ·  ${stage.detail}` : ''}`
    : result
      ? result.company.trim()
        ? `${result.jobTitle} · ${result.company}`
        : result.jobTitle
      : canRun
        ? t('triage.ready')
        : ''

  return (
    <div>
      {/* One card, one gesture (friendly redesign 2026-11-21): paste, then
          Analyse. Where you would work and the link are details, folded
          under one line that already says the market chosen for you. */}
      <div className={running ? 'intake-card is-running' : 'intake-card'}>
        {title && <h2 className="intake-title">{title}</h2>}

        {!result && demoPostings && demoPostings.length > 0 && (
          <div className="intake-demo">
            <p className="intake-hint">{t('demo.choose')}</p>
            <div className="intake-demo-list">
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

        {!result && posting && !editing && (
          <article className="posting-card">
            {posting.company && <p className="posting-company">{posting.company}</p>}
            <h2 className="posting-title">{posting.title}</h2>
            {posting.location && <p className="posting-place">{posting.location}</p>}
            {/* A taste of the text, as one paragraph: enough to know it is the right job. */}
            <p className="posting-body">{posting.body.replace(/\s*\n+\s*/g, ' ')}</p>
            <div className="posting-foot">
              <button type="button" className="posting-link" onClick={() => setEditing(true)}>
                {t('triage.posting.full')}
              </button>
              {webLink(posting.url) && (
                <a
                  className="posting-link"
                  href={webLink(posting.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('triage.posting.original')}
                </a>
              )}
            </div>
          </article>
        )}

        {!result && (!posting || editing) && (
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
            rows={expanded ? 10 : 4}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // biome-ignore lint/a11y/noAutofocus: this page exists to receive a paste
            autoFocus={!compact || editing}
            readOnly={Boolean(demoPostings?.length)}
            placeholder={t('triage.placeholder')}
            aria-label={t('triage.aria')}
            className="field intake-box"
          />
        )}

        {/* Where you would work and the link are details of a posting: shown
            once there is one, so an empty box asks for nothing else. */}
        {!result && (text.trim().length > 0 || url.trim().length > 0) && (
          <details className="intake-more">
            <summary>
              {t(url.trim() ? 'triage.moreLinked' : 'triage.more', {
                market: marketLabel(market, locale),
              })}
            </summary>
            <div className="intake-more-body">
              <label className="intake-field">
                <span>{t('triage.market.label')}</span>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value as Market)}
                  disabled={running}
                  className="field"
                >
                  <MarketOptions own={ownMarkets} current={market} locale={locale} />
                </select>
              </label>
              {/* The link is a fact about the posting, captured here while it
                  is still on the clipboard. */}
              <label className="intake-field">
                <span>{t('triage.url.label')}</span>
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={running}
                  placeholder={t('triage.url.placeholder')}
                  className="field"
                />
              </label>
            </div>
          </details>
        )}

        {/* Live feedback during a 30-second run; muted, never faint. */}
        <p className={status ? 'intake-status' : 'intake-status is-empty'} aria-live="polite">
          {running && <span className="intake-spinner" aria-hidden />}
          <span>{status}</span>
          {result?.cached && <span> {t('triage.cached')}</span>}
        </p>

        {error && (
          // role="alert" so the failure is announced — the status line goes
          // quiet on error, and silence reads as a hang.
          <p role="alert" className="intake-error">
            {error}
          </p>
        )}

        {!result && (
          <div className="intake-actions">
            {secondary}
            <button
              type="button"
              onClick={analyse}
              disabled={running || !canRun}
              className="btn btn-primary"
            >
              {running ? t('triage.running') : t('triage.run')}
            </button>
          </div>
        )}

        {triaged > 0 && <p className="intake-hint">{plural(t, triaged, 'triage.session')}</p>}
        {!result && footer && <div className="intake-footer">{footer}</div>}
      </div>

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
            onBuild={() => router.push(`/application/${result.applicationId}?step=decide`)}
          />
        </div>
      )}
    </div>
  )
}
