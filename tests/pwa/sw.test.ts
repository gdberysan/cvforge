import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

type Handler = (event: Record<string, unknown>) => void

/** Loads public/sw.js against a fake worker scope and returns its handlers. */
function loadWorker() {
  const handlers: Record<string, Handler> = {}
  const scope: Record<string, unknown> = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn
    },
    registration: { showNotification: vi.fn(() => Promise.resolve()) },
    clients: { matchAll: vi.fn(() => Promise.resolve([])), openWindow: vi.fn(), claim: vi.fn() },
    skipWaiting: vi.fn(),
    location: {
      origin: 'https://cvforge.tail1234.ts.net',
      href: 'https://cvforge.tail1234.ts.net/sw.js?v=b1',
    },
  }
  const source = readFileSync('public/sw.js', 'utf8')
  new Function('self', 'caches', 'fetch', source)(scope, {}, vi.fn())
  return { handlers, scope, shouldCache: scope.__shouldCache as (url: string) => boolean }
}

describe('service worker', () => {
  it('caches only versioned static files, icons and the offline page', () => {
    const { shouldCache } = loadWorker()
    const o = 'https://cvforge.tail1234.ts.net'
    expect(shouldCache(`${o}/_next/static/chunks/app-abc123.js`)).toBe(true)
    expect(shouldCache(`${o}/icons/icon-192.png`)).toBe(true)
    expect(shouldCache(`${o}/offline.html`)).toBe(true)
    expect(shouldCache(`${o}/pipeline`)).toBe(false)
    expect(shouldCache(`${o}/api/export/backup`)).toBe(false)
    expect(shouldCache('https://evil.example/_next/static/x.js')).toBe(false)
  })

  it('shows a pushed notification with its tag and url', async () => {
    const { handlers, scope } = loadWorker()
    const waits: Promise<unknown>[] = []
    handlers.push({
      data: {
        json: () => ({
          title: 'Worth it',
          body: 'Growth Lead · Acme',
          url: '/application/a1',
          tag: 'verdict-ready',
        }),
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    const registration = scope.registration as { showNotification: ReturnType<typeof vi.fn> }
    expect(registration.showNotification).toHaveBeenCalledWith('Worth it', {
      body: 'Growth Lead · Acme',
      tag: 'verdict-ready',
      data: { url: '/application/a1' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  })

  it('stays silent when the app is already in front of the person', async () => {
    const { handlers, scope } = loadWorker()
    ;(scope.clients as { matchAll: ReturnType<typeof vi.fn> }).matchAll = vi.fn(() =>
      Promise.resolve([{ focused: true, visibilityState: 'visible' }]),
    )
    const waits: Promise<unknown>[] = []
    handlers.push({
      data: { json: () => ({ title: 'T', body: 'B', url: '/a', tag: 'verdict-ready' }) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    const registration = scope.registration as { showNotification: ReturnType<typeof vi.fn> }
    expect(registration.showNotification).not.toHaveBeenCalled()
  })

  it('a test push shows even with the app in front — the person tapped "send a test" to see it', async () => {
    const { handlers, scope } = loadWorker()
    ;(scope.clients as { matchAll: ReturnType<typeof vi.fn> }).matchAll = vi.fn(() =>
      Promise.resolve([{ focused: true, visibilityState: 'visible' }]),
    )
    const waits: Promise<unknown>[] = []
    handlers.push({
      data: { json: () => ({ title: 'CVForge', body: 'B', url: '/settings', tag: 'test' }) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    const registration = scope.registration as { showNotification: ReturnType<typeof vi.fn> }
    expect(registration.showNotification).toHaveBeenCalledOnce()
  })

  it('a tap opens the url even when the open window refuses to navigate', async () => {
    const { handlers, scope } = loadWorker()
    const openWindow = vi.fn()
    const clients = scope.clients as Record<string, unknown>
    clients.openWindow = openWindow
    clients.matchAll = vi.fn(() =>
      Promise.resolve([
        { focus: vi.fn(), navigate: vi.fn(() => Promise.reject(new TypeError('uncontrolled'))) },
      ]),
    )
    const waits: Promise<unknown>[] = []
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url: '/application/a1' } },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    expect(openWindow).toHaveBeenCalledWith('/application/a1')
  })
})
