// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfPager } from '@/components/studio/PdfPager'

afterEach(cleanup)

// jsdom has no 2D context, and the component now genuinely reaches for one.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never
})

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  }),
}))

global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
) as unknown as typeof fetch

describe('PdfPager', () => {
  it('shows page 1 of 2 for a two-page document and can advance to page 2', async () => {
    render(<PdfPager applicationId="app_1" refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/1.*2/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /next|→/i }))
    await waitFor(() => expect(screen.getByText(/2.*2/)).toBeTruthy())
  })

  it('explains a missing PDF engine and points to Settings, instead of a flat error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    ) as unknown as typeof fetch

    render(<PdfPager applicationId="app_1" refreshKey={0} />)
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

    render(<PdfPager applicationId="app_1" refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/preview unavailable/i)).toBeTruthy())
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull()
  })
})
