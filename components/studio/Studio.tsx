'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import { renderPlaintext } from '@/lib/render/plaintext'
import type { CVContent, EvidenceItem, GroundingReport } from '@/lib/schemas'
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
  initialCv,
  initialReport,
}: {
  applicationId: string
  company: string
  documentLanguage: 'en' | 'es-MX'
  evidence: EvidenceItem[]
  initialCv: CVContent | null
  initialReport: GroundingReport | null
}) {
  const t = useT()
  const [cv, setCv] = useState(initialCv)
  const [report, setReport] = useState(initialReport)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Bumped after a successful generate() so PdfPager knows to re-fetch the
  // freshly regenerated PDF rather than showing the previous one.
  const [refreshKey, setRefreshKey] = useState(0)

  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  const bulletsByEvidence = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const role of cv?.experience ?? []) {
      for (const bullet of role.bullets) {
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
    try {
      const res = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new ApiFailure(data.error, data.code)
      setCv(data.cv)
      setReport(data.report)
      setRefreshKey((k) => k + 1)
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

  async function downloadPdf() {
    const res = await fetch(`/api/export/pdf?applicationId=${applicationId}`)
    if (res.status === 503) {
      // No engine on this machine: print the identical template via the
      // browser dialog. A blob URL, not document.write — same document,
      // safer plumbing. The hint bar teaches the two dialog settings that
      // make the output clean; the browser remembers them afterwards.
      const { html } = await res.json()
      const hint =
        `<style>@media print{.__hint{display:none}}</style>` +
        `<div class="__hint" style="position:sticky;top:0;background:#0E131B;color:#EFF3F8;` +
        `font:14px/1.5 system-ui,sans-serif;padding:10px 16px;text-align:center">` +
        `${t('studio.printHint')}</div>`
      const doc = html.replace(/<body([^>]*)>/, `<body$1>${hint}`)
      const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
      const w = window.open(url, '_blank')
      w?.addEventListener('load', () => {
        w.print()
        URL.revokeObjectURL(url)
      })
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? t('studio.failed'))
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? `CV-${company}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadDocx() {
    const res = await fetch(`/api/export/docx?applicationId=${applicationId}`)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? t('studio.failed'))
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? `CV-${company}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Half of application forms are a textarea; this feeds them directly. */
  async function copyPlaintext() {
    if (!cv) return
    await navigator.clipboard.writeText(renderPlaintext(cv, { language: documentLanguage }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isEvidenceActive = (id: string) => activeEvidenceId === id

  return (
    <div className="studio-grid">
      <div>
        {report && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <GroundingFlags report={report} />
          </div>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--signal-error)', marginBottom: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {!cv ? (
          <p aria-live="polite">
            {running ? (
              <span className="fact">
                {t('studio.generating')}
                <span className="cursor" aria-hidden style={{ marginLeft: 'var(--space-2)' }} />
              </span>
            ) : (
              <button type="button" onClick={generate} className="btn btn-primary">
                {t('studio.generate')}
              </button>
            )}
          </p>
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
              <button type="button" onClick={downloadPdf} className="btn btn-primary">
                {t('studio.downloadPdf')}
              </button>
              <button type="button" onClick={downloadDocx} className="btn btn-quiet">
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

      <aside style={{ position: 'sticky', top: 88, height: 'fit-content' }}>
        <p className="eyebrow">{t('studio.evidenceUsed')}</p>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--space-3) 0 0',
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          {evidence
            .filter((item) => bulletsByEvidence.has(item.id))
            .map((item) => {
              const active = isEvidenceActive(item.id)
              return (
                <li
                  key={item.id}
                  onMouseEnter={() => setActiveEvidenceId(item.id)}
                  onMouseLeave={() => setActiveEvidenceId(null)}
                  style={{
                    background: active ? 'var(--surface-raised)' : 'var(--surface-card)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)',
                    font: 'var(--type-body-sm)',
                    color: 'var(--text-body)',
                    transition: 'border-color 120ms cubic-bezier(.16,1,.3,1)',
                  }}
                >
                  <span className="ident">{item.id}</span>
                  <p style={{ margin: 'var(--space-2) 0 0' }}>{item.text}</p>
                </li>
              )
            })}
        </ul>
      </aside>
    </div>
  )
}
