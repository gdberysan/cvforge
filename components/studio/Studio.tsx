'use client'

import { useRouter } from 'next/navigation'
import { useContext, useMemo, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { AtsReport } from '@/components/studio/AtsReport'
import { ComposeProgress } from '@/components/studio/ComposeProgress'
import { CvEditor } from '@/components/studio/CvEditor'
import { CostNote } from '@/components/ui/CostNote'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { IconCopy, IconDownload, IconFind, IconRegenerate, IconStack } from '@/components/ui/icons'
import { Sheet } from '@/components/ui/Sheet'
import { useMedia } from '@/components/ui/use-media'
import type { ComposeStage } from '@/lib/ai/compose'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import { renderPlaintext } from '@/lib/render/plaintext'
import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  Requirement,
} from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'
import { copyText } from '@/lib/ui/copy'
import { printHtml, saveResponse } from '@/lib/ui/download'
import { haptic } from '@/lib/ui/haptics'
import { cvLineText } from '@/lib/verify/line-text'
import { DocumentsLocked, GroundingFlags } from './GroundingFlags'
import { PdfPager } from './PdfPager'
import { VariantPicker } from './VariantPicker'

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
  variants,
  requirements = [],
  mappings = [],
}: {
  applicationId: string
  company: string
  documentLanguage: 'en' | 'es-MX'
  evidence: EvidenceItem[]
  sourceLabels: Record<string, string>
  initialCv: CVContent | null
  initialReport: GroundingReport | null
  variants: { id: string; label: string; stale: boolean }[]
  /** The posting's requirements and how the record meets them: the ATS report. */
  requirements?: Requirement[]
  mappings?: EvidenceMapping[]
}) {
  const t = useT()
  const router = useRouter()
  const locked = useContext(DocumentsLocked)
  const [cv, setCv] = useState(initialCv)
  const [report, setReport] = useState(initialReport)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<ComposeStage | null>(null)
  const [seen, setSeen] = useState<ComposeStage[]>([])
  const [error, setErrorText] = useState<string | null>(null)
  // The failure's code beside its message: ErrorNote picks the way past it.
  const [errorCode, setErrorCode] = useState<string | undefined>()
  const setError = (text: string | null) => {
    setErrorText(text)
    setErrorCode(undefined)
  }
  const [copied, setCopied] = useState(false)
  // The print dialog opens over this page, so its two settings are taught here.
  const [printHint, setPrintHint] = useState(false)
  // Bumped after a successful generate() so PdfPager knows to re-fetch the
  // freshly regenerated PDF rather than showing the previous one.
  const [refreshKey, setRefreshKey] = useState(0)
  // Editing the words in place (CvEditor); the PDF waits until it is saved.
  const [editing, setEditing] = useState(false)

  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)
  const [seek, setSeek] = useState<{ text: string; n: number } | null>(null)
  // Under 900px the PDF gets the width: the evidence it cites moves into a sheet.
  const narrow = useMedia('(max-width: 899px)')
  const [evidenceOpen, setEvidenceOpen] = useState(false)

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

  function applied(next: CVContent, nextReport: GroundingReport) {
    setError(null)
    setCv(next)
    setReport(nextReport)
    setRefreshKey((k) => k + 1)
  }

  const picker = (
    <VariantPicker
      applicationId={applicationId}
      variants={variants}
      hasCv={cv !== null}
      onApplied={applied}
    />
  )

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
      haptic('done')
    } catch (e) {
      // The background kit is writing this one: the page swaps to its progress.
      if (e instanceof ApiFailure && e.code === 'kit-busy') router.refresh()
      else haptic('failed')
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('studio.failed'),
      )
      setErrorCode(e instanceof ApiFailure ? e.code : undefined)
    } finally {
      setRunning(false)
    }
  }

  async function download(kind: 'pdf' | 'docx') {
    setError(null)
    try {
      const res = await fetch(`/api/export/${kind}?applicationId=${applicationId}`)
      if (kind === 'pdf' && res.status === 503) {
        const { html } = await res.json()
        setPrintHint(true)
        printHtml(html)
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
    if (!(await copyText(renderPlaintext(cv, { language: documentLanguage })))) {
      setError(t('studio.copyFailed'))
      return
    }
    haptic('confirm')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isEvidenceActive = (id: string) => activeEvidenceId === id

  const bulletText = useMemo(() => cvLineText(cv), [cv])

  // The evidence behind this CV, grouped by where it came from: a reference
  // to scan, not a second document to read. Each record is two lines until
  // opened.
  const used = evidence.filter((item) => bulletsByEvidence.has(item.id))
  const groups = [...new Set(used.map((i) => sourceLabels[i.id] || i.id))].map((label) => ({
    label,
    items: used.filter((i) => (sourceLabels[i.id] || i.id) === label),
  }))

  // The same list in the column and in the sheet; in the sheet, turning to a
  // line in the PDF also closes it, so the page is what you see next.
  const evidenceList = (afterSeek: () => void) =>
    groups.map((g) => (
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
              <button
                type="button"
                className="ev-find"
                aria-label={t('studio.showInPdf')}
                onClick={() => {
                  const first = bulletsByEvidence.get(item.id)?.[0]
                  const text = first ? bulletText[first] : undefined
                  if (text) setSeek((prev) => ({ text, n: (prev?.n ?? 0) + 1 }))
                  afterSeek()
                }}
              >
                <IconFind />
              </button>
            </li>
          ))}
        </ul>
      </section>
    ))

  return (
    <div className="studio-grid">
      <div className="doc-main">
        {report && (
          <div className="doc-block">
            <GroundingFlags report={report} textOf={bulletText} />
          </div>
        )}
        {error && <ErrorNote code={errorCode}>{error}</ErrorNote>}
        {printHint && <p className="fact doc-block is-muted">{t('studio.printHint')}</p>}

        {!cv ? (
          running ? (
            <ComposeProgress stage={stage} seen={seen} />
          ) : (
            <div className="doc-empty">
              <p className="doc-empty-lede">{t('studio.noCvLede')}</p>
              {picker}
              <button type="button" onClick={generate} className="btn btn-primary">
                {t('studio.generate')}
              </button>
              <CostNote action="cv" />
            </div>
          )
        ) : (
          <>
            <div aria-live="polite" className="doc-actions">
              <button
                type="button"
                onClick={() => download('pdf')}
                className="btn btn-primary icon-label"
              >
                <IconDownload />
                {t('studio.downloadPdf')}
              </button>
              <button
                type="button"
                onClick={() => download('docx')}
                className="btn btn-quiet icon-label"
              >
                <IconDownload />
                {t('studio.downloadDocx')}
              </button>
              <button type="button" onClick={copyPlaintext} className="btn btn-quiet icon-label">
                <IconCopy />
                {copied ? t('studio.copied') : t('studio.copyText')}
              </button>
              {!locked && !running && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn-quiet icon-label"
                >
                  {t('cvEdit.open')}
                </button>
              )}
              {/* Once it is sent or settled, rewriting is no longer offered. */}
              {!locked && (
                <button
                  type="button"
                  onClick={generate}
                  disabled={running}
                  className="btn btn-quiet icon-label"
                >
                  <IconRegenerate />
                  {running ? t('studio.generating') : t('studio.regenerate')}
                </button>
              )}
              {running && <span className="intake-spinner" aria-hidden />}
              {narrow && used.length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet icon-label"
                  onClick={() => setEvidenceOpen(true)}
                >
                  <IconStack />
                  {t('studio.evidenceUsedCount', { n: used.length })}
                </button>
              )}
            </div>
            {!running && !locked && <div className="doc-block doc-picker">{picker}</div>}
            {running && (
              <div className="doc-progress">
                <ComposeProgress stage={stage} seen={seen} />
              </div>
            )}

            {/* The real, paginated PDF — not a hand-written HTML mirror with
                no page concept. Shows the literal file /api/export/pdf
                produces, page by page; "show in the PDF" on an evidence
                record turns to the page that prints its first line. */}
            {editing && cv && (
              <CvEditor
                applicationId={applicationId}
                cv={cv}
                onSaved={(next, nextReport) => {
                  applied(next, nextReport)
                  setEditing(false)
                }}
                onCancel={() => setEditing(false)}
              />
            )}
            <div className="doc-pdf" hidden={editing}>
              <PdfPager
                query={`applicationId=${applicationId}`}
                refreshKey={refreshKey}
                seek={seek}
                onDownload={() => download('pdf')}
              />
            </div>
            {!running && !editing && cv && (
              <AtsReport cv={cv} requirements={requirements} mappings={mappings} />
            )}
          </>
        )}
      </div>

      {/* Only once there is a CV: before that it was an empty column. */}
      {cv && used.length > 0 && !narrow && (
        <aside className="evidence-ref" aria-label={t('studio.evidenceUsed')}>
          <p className="evidence-ref-title">
            {t('studio.evidenceUsed')} <span className="chip-count">{used.length}</span>
          </p>
          {evidenceList(() => {})}
        </aside>
      )}
      {cv && used.length > 0 && narrow && (
        <Sheet
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          title={t('studio.evidenceUsed')}
        >
          {evidenceList(() => setEvidenceOpen(false))}
        </Sheet>
      )}
    </div>
  )
}
