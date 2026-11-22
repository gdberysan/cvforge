/**
 * Components fetch('/api/…') as on the desktop — triage, compose, CV import
 * stream their progress that way. In the browser there is no server: this
 * wraps the page's fetch so a same-origin /api/ request runs the desktop
 * route handler in the Worker, and its body streams back as it is produced.
 */

import { printHtml, saveResponse } from '@/lib/ui/download'
import type { RouteEvent } from '@/web/worker/bridge'
import { dataChanged, workerApi } from './actions-client'
import { jobEnded, jobStarted } from './jobs'

export function installFetchBridge(): void {
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
      return original(input, init)
    }
    const request = input instanceof Request ? input : new Request(url, init)
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? null
        : new Uint8Array(await request.arrayBuffer())
    const api = await workerApi()
    // A POST to /api/ai/* is a paid, multi-second job; exports are not.
    const isJob = request.method === 'POST' && url.pathname.startsWith('/api/ai/')
    if (isJob) jobStarted()

    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const onEvent = (event: RouteEvent) => {
        if (event.kind === 'head') {
          resolve(new Response(stream, { status: event.status, headers: event.headers }))
        } else controller?.enqueue(event.bytes)
      }
      api
        .route(
          `${url.pathname}${url.search}`,
          { method: request.method, headers: [...request.headers.entries()], body },
          onEvent,
        )
        .then(() => {
          controller?.close()
          dataChanged()
        })
        .catch((err: unknown) => {
          controller?.error(err)
          reject(err)
        })
        .finally(() => {
          if (isJob) jobEnded()
        })
    })
  }
}

/**
 * A plain link to /api/… (the send step's PDF and DOCX, a download="" anchor)
 * is a navigation, not a fetch: on a static host it would hit a 404. Caught
 * here, fetched through the bridge, and saved — or, for a PDF, printed
 * through the browser's own dialog, the same fallback the studio uses.
 */
export function installDownloadBridge(): void {
  document.addEventListener(
    'click',
    (event) => {
      const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || event.defaultPrevented || event.button !== 0) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return
      event.preventDefault()
      void (async () => {
        const res = await fetch(`${url.pathname}${url.search}`)
        if (res.status === 503) {
          const body = (await res.json().catch(() => null)) as { html?: string } | null
          if (body?.html) printHtml(body.html)
          return
        }
        if (res.ok) await saveResponse(res, url.pathname.split('/').pop() ?? 'download')
      })()
    },
    true,
  )
}
