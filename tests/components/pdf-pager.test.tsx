// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfPager } from '@/components/studio/PdfPager'

afterEach(cleanup)

// jsdom has no 2D context, and the component now genuinely reaches for one.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never
})

// The first paint never settles on its own: a page flip must cancel it.
const cancelFirst = vi.fn()
const renderPage = vi
  .fn()
  .mockImplementationOnce(() => ({ promise: new Promise(() => {}), cancel: cancelFirst }))
  .mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: renderPage,
        }),
    }),
  }),
}))

global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
) as unknown as typeof fetch

describe('PdfPager', () => {
  it('shows page 1 of 2 for a two-page document and can advance to page 2', async () => {
    render(<PdfPager query="applicationId=app_1" refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/1.*2/)).toBeTruthy())
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /next|→/i }))
    await waitFor(() => expect(screen.getByText(/2.*2/)).toBeTruthy())
    // Backlog #9: the page-1 render still in flight is cancelled, not left
    // racing page 2 on the same canvas.
    expect(cancelFirst).toHaveBeenCalled()
  })

  it('in the browser edition (printOnly), previews the print-ready HTML instead', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: 'chromium-unavailable',
            html: '<p>Ana CV</p>',
            printOnly: true,
          }),
      }),
    ) as unknown as typeof fetch

    const { container } = render(<PdfPager query="applicationId=app_1" refreshKey={0} />)
    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy())
    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<p>Ana CV</p>')
    expect(screen.queryByText(/no pdf engine/i)).toBeNull()
  })

  // 2026-11-24: on Rumbo the CV page threw "Cannot read properties of null
  // (reading 'scrollHeight')" while the preview's document was being swapped.
  it('measures a frame whose document has no root yet without throwing', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: 'chromium-unavailable',
            html: '<p>Ana CV</p>',
            printOnly: true,
          }),
      }),
    ) as unknown as typeof fetch
    const spy = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get')
      .mockReturnValue({ documentElement: null, body: null } as unknown as Document)
    try {
      const { container } = render(<PdfPager query="applicationId=app_1" refreshKey={0} />)
      await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy())
      const frame = container.querySelector('iframe') as HTMLIFrameElement
      expect(() => fireEvent.load(frame)).not.toThrow()
      expect(frame.style.height).toBe(`${Math.round(794 * Math.SQRT2)}px`)
    } finally {
      spy.mockRestore()
    }
  })

  it('explains a missing PDF engine and points to Settings, instead of a flat error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    ) as unknown as typeof fetch

    render(<PdfPager query="applicationId=app_1" refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/no pdf engine/i)).toBeTruthy())
    expect(screen.getByRole('link', { name: /settings/i })).toBeTruthy()
  })

  it('shows a generic message for any other failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    ) as unknown as typeof fetch

    render(<PdfPager query="applicationId=app_1" refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/preview isn't available/i)).toBeTruthy())
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull()
  })

  it('a failed preview offers the download, through the same path as the button', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    ) as unknown as typeof fetch
    const onDownload = vi.fn()
    render(<PdfPager query="applicationId=app_1" refreshKey={0} onDownload={onDownload} />)
    fireEvent.click(await screen.findByRole('button', { name: /download pdf/i }))
    expect(onDownload).toHaveBeenCalledOnce()
  })
})
