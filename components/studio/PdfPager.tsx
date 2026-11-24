'use client'

import Link from 'next/link'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron, IconDownload } from '@/components/ui/icons'
import { MAX_PAGES } from '@/lib/render/page-budget'

type PreviewError = 'no-engine' | 'other' | null

/**
 * Renders the exact bytes /api/export/pdf produces, page by page — the
 * preview used to be a hand-written HTML mirror with no page concept at
 * all, so a multi-page CV just grew taller instead of paginating. This
 * shows the literal file the user is about to download, with a quiet
 * prev/next pager (dc-navbtn).
 */
export function PdfPager({
  query,
  refreshKey,
  seek = null,
  onDownload,
}: {
  /** Which CV: `applicationId=…` or `variantId=…`, as /api/export/pdf takes it. */
  query: string
  refreshKey: number
  /** Turn to the page that prints this text. `n` changes on every request,
   *  so asking for the same line twice still turns the page. */
  seek?: { text: string; n: number } | null
  /** The download path (with its print fallback), offered when the preview cannot render. */
  onDownload?: () => void
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
  /** The browser edition's preview: the print-ready HTML (no PDF engine there). */
  const [html, setHtml] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a pure trigger — Studio bumps it after generate() so this re-fetches the newly composed PDF; deliberately unreferenced in the body.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setDoc(null)
    setHtml(null)
    setPage(1)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const res = await fetch(`/api/export/pdf?${query}`)
        if (!res.ok) {
          // 503 means no PDF engine was found on this machine (checked at
          // /api/export/pdf) — Download still works because it falls back to
          // the browser's own print dialog against the same HTML. The preview
          // has no such fallback: pdf.js needs real PDF bytes, and print-ready
          // HTML isn't that, so point at the one-click install instead of
          // showing a bare, unexplained failure.
          // The browser edition has no engine by design and says so
          // (printOnly): preview the print-ready HTML itself.
          const body =
            res.status === 503
              ? await Promise.resolve()
                  .then(() => res.json())
                  .catch(() => null)
              : null
          if (body?.printOnly && typeof body.html === 'string') {
            if (!cancelled) setHtml(body.html)
            return
          }
          if (!cancelled) setError(res.status === 503 ? 'no-engine' : 'other')
          return
        }
        const bytes = await res.arrayBuffer()
        const loaded = await pdfjs.getDocument({ data: bytes }).promise
        if (cancelled) return
        setDoc(loaded)
      } catch {
        // The local server went away, or the bytes were not a PDF: an
        // unhandled rejection here left the pane on "generating…" forever.
        if (!cancelled) setError('other')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [query, refreshKey])

  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    // Flipping pages faster than a page paints started a second render on
    // the same canvas while the first ran — pdf.js refuses that, and the
    // pane could stay on the stale page. The superseded render is cancelled.
    let task: RenderTask | null = null
    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (!pdfPage || cancelled) return
      const viewport = pdfPage.getViewport({ scale: 1.4 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      // pdfjs 5+ takes the canvas itself and owns its context.
      task = pdfPage.render({ canvas, viewport })
      await task.promise.catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e
      })
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, page])

  // The canvas has no per-line DOM to highlight, so a line is found the way
  // a reader would: by turning to the page it is printed on. pdf.js reads
  // each page's text; line wraps and spacing differ from the source, so both
  // sides are compared with whitespace removed, on the line's opening words.
  useEffect(() => {
    if (!doc || !seek) return
    let cancelled = false
    const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase()
    const needle = squash(seek.text).slice(0, 48)
    ;(async () => {
      for (let p = 1; p <= doc.numPages; p++) {
        const content = await (await doc.getPage(p)).getTextContent()
        if (cancelled) return
        const text = content.items.map((i) => ('str' in i ? i.str : '')).join('')
        if (squash(text).includes(needle)) {
          setPage(p)
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doc, seek])

  // One line saying so, and the way out: the download has its own print
  // fallback, so it still works where the preview cannot.
  if (error) {
    return (
      <div className="pdf-unavailable">
        <p className="pdf-unavailable-text">
          {t(error === 'no-engine' ? 'studio.pdfPreviewNoEngine' : 'studio.pdfPreviewUnavailable')}
        </p>
        <div className="pdf-unavailable-actions">
          {onDownload && (
            <button type="button" className="btn btn-quiet icon-label" onClick={onDownload}>
              <IconDownload />
              {t('studio.downloadPdf')}
            </button>
          )}
          {error === 'no-engine' && (
            <Link href="/settings" className="action">
              {t('studio.pdfPreviewGoToSettings')}
            </Link>
          )}
        </div>
      </div>
    )
  }
  if (html) {
    return (
      <div>
        {/* Download lives in the toolbar above; a second button here was noise. */}
        <ScaledHtmlPreview html={html} title={t('studio.previewTitle')} />
      </div>
    )
  }
  if (numPages === 0) return <p className="fact">{t('studio.generating')}</p>

  return (
    <div>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <nav aria-label={t('studio.pdfPageNav')} className="pdf-nav">
        <button
          type="button"
          className="pdf-navbtn"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label={t('studio.pdfPrev')}
        >
          <IconChevron flip />
        </button>
        <span className="fact">{t('studio.pdfPage', { n: page, total: numPages })}</span>
        <button
          type="button"
          className="pdf-navbtn"
          disabled={page >= numPages}
          onClick={() => setPage((p) => p + 1)}
          aria-label={t('studio.pdfNext')}
        >
          <IconChevron />
        </button>
      </nav>
      {/* The composer trims to the limit in code, so this shows on CVs
          written before it did, or past the point trimming stops (one
          bullet per role). Measured on the real file, not estimated. */}
      {numPages > MAX_PAGES && (
        <p className="fact pdf-over" role="status">
          {t('studio.overPages', { n: numPages, max: MAX_PAGES })}
        </p>
      )}
    </div>
  )
}

/** A4 at 96 dpi: the width the CV's HTML is laid out for. */
const A4_PX = 794

/**
 * The CV as HTML (the web edition has no PDF engine), laid out at its real
 * A4 width and scaled down to the column it sits in, every page shown. An
 * unscaled frame clipped the right edge and cut the page off at the bottom.
 */
function ScaledHtmlPreview({ html, title }: { html: string; title: string }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  // The first page shows; the rest opens on request, so the CV does not
  // push everything after it four screens down.
  const [whole, setWhole] = useState(false)
  const [longer, setLonger] = useState(false)
  const wholeRef = useRef(whole)
  wholeRef.current = whole

  // Sizes are set on the elements, not as inline style props: they follow
  // the column's width and the document's height, measured here.
  function layout() {
    const el = box.current
    const f = frame.current
    if (!el || !f) return
    const scale = Math.min(1, el.clientWidth / A4_PX) || 0.5
    // While the frame swaps documents its root is briefly null; measure the
    // page size then, and the frame's load runs layout again.
    const doc = f.contentDocument
    const root = doc?.documentElement
    const height = root
      ? Math.max(root.scrollHeight, doc?.body?.scrollHeight ?? 0)
      : Math.round(A4_PX * Math.SQRT2)
    f.style.width = `${A4_PX}px`
    f.style.height = `${height}px`
    f.style.transform = `scale(${scale})`
    const page = Math.round(A4_PX * Math.SQRT2)
    setLonger(height > page + 40)
    el.style.height = `${Math.ceil((wholeRef.current ? height : Math.min(height, page)) * scale)}px`
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: layout reads the refs; html is the trigger
  useEffect(() => {
    layout()
    if (typeof ResizeObserver === 'undefined' || !box.current) return
    const ro = new ResizeObserver(layout)
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [html, whole])

  return (
    <>
      <div ref={box} className={`pdf-html-box${longer && !whole ? ' is-clipped' : ''}`}>
        <iframe
          ref={frame}
          srcDoc={html}
          title={title}
          className="pdf-html-preview"
          onLoad={layout}
          scrolling="no"
        />
      </div>
      {longer && (
        <button
          type="button"
          className="btn btn-quiet pdf-whole"
          aria-expanded={whole}
          onClick={() => setWhole(!whole)}
        >
          {whole ? t('studio.previewFirstPage') : t('studio.previewWhole')}
        </button>
      )}
    </>
  )
}
