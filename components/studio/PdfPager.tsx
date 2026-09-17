'use client'

import Link from 'next/link'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'

type PreviewError = 'no-engine' | 'other' | null

/**
 * Renders the exact bytes /api/export/pdf produces, page by page — the
 * preview used to be a hand-written HTML mirror with no page concept at
 * all, so a multi-page CV just grew taller instead of paginating. This
 * shows the literal file the user is about to download, with a quiet
 * prev/next pager (dc-navbtn).
 */
export function PdfPager({
  applicationId,
  refreshKey,
}: {
  applicationId: string
  refreshKey: number
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /**
   * State, not a ref: the canvas only mounts once the document has loaded, so
   * the paint effect must re-run when it arrives. A ref is invisible to
   * React's dependency tracking, which left a single-page CV — both pager
   * buttons disabled, so nothing to trigger a repaint — showing a blank pane.
   */
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  /** Derived, never stored twice: the document is the only source of truth. */
  const numPages = doc?.numPages ?? 0
  const [page, setPage] = useState(1)
  const [error, setError] = useState<PreviewError>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a pure trigger — Studio bumps it after generate() so this re-fetches the newly composed PDF; deliberately unreferenced in the body.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setDoc(null)
    setPage(1)
    ;(async () => {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      const res = await fetch(`/api/export/pdf?applicationId=${applicationId}`)
      if (!res.ok) {
        // 503 means no PDF engine was found on this machine (checked at
        // /api/export/pdf) — Download still works because it falls back to
        // the browser's own print dialog against the same HTML. The preview
        // has no such fallback: pdf.js needs real PDF bytes, and print-ready
        // HTML isn't that, so point at the one-click install instead of
        // showing a bare, unexplained failure.
        if (!cancelled) setError(res.status === 503 ? 'no-engine' : 'other')
        return
      }
      const bytes = await res.arrayBuffer()
      const loaded = await pdfjs.getDocument({ data: bytes }).promise
      if (cancelled) return
      setDoc(loaded)
    })()
    return () => {
      cancelled = true
    }
  }, [applicationId, refreshKey])

  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (!pdfPage || cancelled) return
      const viewport = pdfPage.getViewport({ scale: 1.4 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await pdfPage.render({ canvasContext: ctx, viewport }).promise
    })()
    return () => {
      cancelled = true
    }
  }, [doc, page])

  if (error === 'no-engine') {
    return (
      <p className="fact">
        {t('studio.pdfPreviewNoEngine')}{' '}
        <Link href="/settings" className="action">
          {t('studio.pdfPreviewGoToSettings')}
        </Link>
      </p>
    )
  }
  if (error === 'other') return <p className="fact">{t('studio.pdfPreviewUnavailable')}</p>
  if (numPages === 0) return <p className="fact">{t('studio.generating')}</p>

  return (
    <div>
      <canvas ref={canvasRef} style={{ boxShadow: 'var(--shadow-lg)', maxWidth: '100%' }} />
      <nav
        aria-label={t('studio.pdfPageNav')}
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          marginTop: 'var(--space-3)',
        }}
      >
        <button
          type="button"
          className={page <= 1 ? 'dc-navbtn dc-navbtn--off' : 'dc-navbtn'}
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label={t('studio.pdfPrev')}
        >
          ←
        </button>
        <span className="fact">{t('studio.pdfPage', { n: page, total: numPages })}</span>
        <button
          type="button"
          className={page >= numPages ? 'dc-navbtn dc-navbtn--off' : 'dc-navbtn'}
          disabled={page >= numPages}
          onClick={() => setPage((p) => p + 1)}
          aria-label={t('studio.pdfNext')}
        >
          →
        </button>
      </nav>
    </div>
  )
}
