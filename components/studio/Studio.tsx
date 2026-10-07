'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ComposeProgress } from '@/components/studio/ComposeProgress'
import type { ComposeStage } from '@/lib/ai/compose'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import { renderPlaintext } from '@/lib/render/plaintext'
import type { CVContent, EvidenceItem, GroundingReport } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'
import { GroundingFlags } from './GroundingFlags'
import { PdfPager } from './PdfPager'

/**
 * The slow lane. The document renders as the actual paginated PDF, floating
 * on the graphite canvas — what you send is visibly not what you are
 * looking at. The evidence list on the right is filtered to exactly what
 * the current draft cites, and hovering an item highlights it: seeing the
 * grounding for yourself is what makes "nothing was invented" checkable
 * rather than claimed.
 */
export function Studio({
  applicationId,
  company,
  documentLanguage,
  evidence,
  sourceLabels,
  initialCv,
  initialReport,
}: {
  applicationId: string
  company: string
  documentLanguage: 'en' | 'es-MX'
  evidence: EvidenceItem[]
  sourceLabels: Record<string, string>
  initialCv: CVContent | null
  initialReport: GroundingReport | null
}) {
  const t = useT()
  const [cv, setCv] = useState(initialCv)
  const [report, setReport] = useState(initialReport)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<ComposeStage | null>(null)
  const [seen, setSeen] = useState<ComposeStage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // The print dialog opens over this page, so its two settings are taught here.
  const [printHint, setPrintHint] = useState(false)
  // Bumped after a successful generate() so PdfPager knows to re-fetch the
  // freshly regenerated PDF rather than showing the previous one.
  const [refreshKey, setRefreshKey] = useState(0)

  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  const bulletsByEvidence = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const section of [...(cv?.experience ?? []), ...(cv?.projects ?? [])]) {
      for (const bullet of section.bullets) {
        for (const id of bullet.citedEvidenceIds) {
          map.set(id, [...(map.get(id) ?? []), bullet.id])
        }
      }
    }
    return map
  }, [cv])

  async function generate() {
    setRunning(true)
    setError(null)
    setStage(null)
    setSeen([])
    try {
      const res = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiFailure(data.error ?? t('studio.failed'), data.code)
      }
      let finished = false
      await readEventStream(res.body, (event) => {
        if (typeof event.stage === 'string') {
          const next = event.stage as ComposeStage
          setStage(next)
          setSeen((prev) => (prev.includes(next) ? prev : [...prev, next]))
        }
        if (event.done) {
          finished = true
          setCv(event.cv as CVContent)
          setReport(event.report as GroundingReport)
          setRefreshKey((k) => k + 1)
        }
      })
      if (!finished) throw new ApiFailure(t('studio.failed'), 'unexpected')
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('studio.failed'),
      )
    } finally {
      setRunning(false)
    }
  }

  /** Saves a response as a file. Revoked later: Safari cancels a download whose URL dies at once. */
  async function saveResponse(res: Response, fallbackName: string) {
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download =
      res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? fallbackName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /**
   * No engine on this machine: print the identical template via the browser
   * dialog. A hidden iframe, not a popup: window.open returns null when
   * popups are blocked (so nothing happened), and its `load` could fire for
   * the initial about:blank before the CV arrived — printing a blank page.
   * The iframe prints only after its own document has loaded.
   */
  function printFallback(html: string) {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
    frame.onload = () => {
      const w = frame.contentWindow
      if (!w) return
      w.addEventListener('afterprint', () => frame.remove())
      w.focus()
      w.print()
    }
    setPrintHint(true)
    frame.srcdoc = html
    document.body.appendChild(frame)
  }

  async function download(kind: 'pdf' | 'docx') {
    setError(null)
    try {
      const res = await fetch(`/api/export/${kind}?applicationId=${applicationId}`)
      if (kind === 'pdf' && res.status === 503) {
        const { html } = await res.json()
        printFallback(html)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? t('studio.downloadFailed'))
        return
      }
      await saveResponse(res, `CV-${company}.${kind}`)
    } catch {
      // The local server went away mid-request (quit, sleep): say so rather
      // than leave a button that silently did nothing.
      setError(t('studio.downloadFailed'))
    }
  }

  /** Half of application forms are a textarea; this feeds them directly. */
  async function copyPlaintext() {
    if (!cv) return
    await navigator.clipboard.writeText(renderPlaintext(cv, { language: documentLanguage }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isEvidenceActive = (id: string) => activeEvidenceId === id

  const bulletText = useMemo(
    () =>
      Object.fromEntries(
        [...(cv?.experience ?? []), ...(cv?.projects ?? [])].flatMap((s) =>
          s.bullets.map((b) => [b.id, b.text]),
        ),
      ),
    [cv],
  )

  // The evidence behind this CV, grouped by where it came from: a reference
  // to scan, not a second document to read. Each record is two lines until
  // opened.
  const used = evidence.filter((item) => bulletsByEvidence.has(item.id))
  const groups = [...new Set(used.map((i) => sourceLabels[i.id] || i.id))].map((label) => ({
    label,
    items: used.filter((i) => (sourceLabels[i.id] || i.id) === label),
  }))

  return (
    <div className="studio-grid">
      <div>
        {report && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <GroundingFlags report={report} textOf={bulletText} />
          </div>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--signal-error)', marginBottom: 'var(--space-4)' }}>
            {error}
          </p>
        )}
        {printHint && (
          <p
            className="fact"
            style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}
          >
            {t('studio.printHint')}
          </p>
        )}

        {!cv ? (
          running ? (
            <ComposeProgress stage={stage} seen={seen} />
          ) : (
            <p>
              <button type="button" onClick={generate} className="btn btn-primary">
                {t('studio.generate')}
              </button>
            </p>
          )
        ) : (
          <>
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <button type="button" onClick={() => download('pdf')} className="btn btn-primary">
                {t('studio.downloadPdf')}
              </button>
              <button type="button" onClick={() => download('docx')} className="btn btn-quiet">
                {t('studio.downloadDocx')}
              </button>
              <button type="button" onClick={copyPlaintext} className="btn btn-quiet">
                {copied ? t('studio.copied') : t('studio.copyText')}
              </button>
              <button type="button" onClick={generate} disabled={running} className="btn btn-quiet">
                {running ? t('studio.generating') : t('studio.regenerate')}
              </button>
              {running && <span className="cursor" aria-hidden />}
            </div>
            {running && <ComposeProgress stage={stage} seen={seen} />}

            {/* The real, paginated PDF — not a hand-written HTML mirror with
                no page concept. Shows the literal file /api/export/pdf
                produces, page by page.
                TODO: the bullet↔evidence hover highlight below still lights
                up the evidence list, but the canvas has no per-bullet DOM
                node to highlight back — a future pass could add click-to-
                jump-to-page from the evidence list instead. */}
            <PdfPager applicationId={applicationId} refreshKey={refreshKey} />
          </>
        )}
      </div>

      {/* Only once there is a CV: before that it was an empty column. */}
      {cv && used.length > 0 && (
        <aside className="evidence-ref" aria-label={t('studio.evidenceUsed')}>
          <p className="eyebrow">
            {t('studio.evidenceUsed')}{' '}
            <span className="chip-count" style={{ letterSpacing: 0 }}>
              {used.length}
            </span>
          </p>
          {groups.map((g) => (
            <section key={g.label} className="evidence-group">
              <h3 className="evidence-group-title">
                {g.label}
                <span className="chip-count">{g.items.length}</span>
              </h3>
              <ul>
                {g.items.map((item) => (
                  <li
                    key={item.id}
                    className={isEvidenceActive(item.id) ? 'is-active' : undefined}
                    onMouseEnter={() => setActiveEvidenceId(item.id)}
                    onMouseLeave={() => setActiveEvidenceId(null)}
                  >
                    <details>
                      <summary>{item.text}</summary>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>
      )}
    </div>
  )
}
