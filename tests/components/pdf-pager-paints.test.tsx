// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfPager } from '@/components/studio/PdfPager'

afterEach(cleanup)

/**
 * The sibling suite asserts the pager's label and its prev/next behaviour, and
 * passed happily while the preview painted nothing at all. What it never
 * checked is the only thing the component exists to do: put page 1 on the
 * canvas. A single-page CV is the case that matters — both pager buttons are
 * disabled, so nothing can trigger a repaint after mount.
 */
const paint = vi.fn(() => ({ promise: Promise.resolve() }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: paint,
        }),
    }),
  }),
}))

global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
) as unknown as typeof fetch

beforeEach(() => {
  paint.mockClear()
  // jsdom has no 2D context; without this the component's own `if (!ctx) return`
  // guard would swallow the very call under test.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never
})

describe('PdfPager', () => {
  it('paints the first page of a single-page document without any navigation', async () => {
    render(<PdfPager applicationId="app_1" refreshKey={0} />)
    // The component dynamically imports pdfjs before it can paint; under a
    // loaded parallel suite that outruns waitFor's 1s default.
    await waitFor(() => expect(paint).toHaveBeenCalled(), { timeout: 5000 })
  })
})
