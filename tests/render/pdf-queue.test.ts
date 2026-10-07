import { beforeEach, describe, expect, it, vi } from 'vitest'

let active = 0
let failNext = false
let peak = 0
const launches: string[] = []

function fakeBrowser() {
  let connected = true
  return {
    isConnected: () => connected,
    close: vi.fn(async () => {
      connected = false
    }),
    newPage: async () => ({
      setContent: async () => {},
      pdf: async () => {
        if (failNext) {
          failNext = false
          throw new Error('render broke')
        }
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 20))
        active -= 1
        return Buffer.from('%PDF')
      },
      close: async () => {},
    }),
  }
}

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async (opts: { channel?: string }) => {
      launches.push(opts.channel ?? 'bundled')
      return fakeBrowser()
    }),
  },
}))

const { renderPdf, resetEngineProbe } = await import('@/lib/render/pdf')

beforeEach(() => {
  active = 0
  peak = 0
  launches.length = 0
  resetEngineProbe()
  ;(globalThis as { __cvforgePdfBrowser?: unknown }).__cvforgePdfBrowser = null
})

describe('renderPdf', () => {
  it('runs exports one at a time on one warm browser', async () => {
    // Backlog #10: every export launched its own browser, uncapped.
    const out = await Promise.all([
      renderPdf('<p>a</p>'),
      renderPdf('<p>b</p>'),
      renderPdf('<p>c</p>'),
    ])
    expect(out.map(String)).toEqual(['%PDF', '%PDF', '%PDF'])
    expect(peak).toBe(1)
    // One launch to probe the engine ladder, one shared browser for all three.
    expect(launches).toEqual(['chrome', 'chrome'])
  })

  it('a failed render does not block the next one in the queue', async () => {
    failNext = true
    const [first, second] = await Promise.allSettled([renderPdf('<p>a</p>'), renderPdf('<p>b</p>')])
    expect(first.status).toBe('rejected')
    expect(second).toEqual({ status: 'fulfilled', value: Buffer.from('%PDF') })
  })
})
