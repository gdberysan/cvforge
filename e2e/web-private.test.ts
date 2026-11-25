import path from 'node:path'
import { type Browser, devices, webkit } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveSite } from './serve'

/**
 * Safari's engine in a private-style window keeps no files: the very first
 * one is refused. Before the 2026-11 launch that showed "your data could not
 * be opened, reload", which no reload fixes. The screen must say what to do.
 */
let site: { origin: string; close: () => Promise<void> }
let browser: Browser

beforeAll(async () => {
  site = await serveSite(path.resolve('web/site'))
  browser = await webkit.launch()
})
afterAll(async () => {
  await browser?.close()
  await site?.close()
})

describe('the web edition in a window that keeps no files', () => {
  it('says to open it in a normal window, with the address to copy', async (test) => {
    const { defaultBrowserType: _, ...iphone } = devices['iPhone 15']
    const ctx = await browser.newContext({ ...iphone, locale: 'es-MX' })
    const page = await ctx.newPage()
    await page.goto(`${site.origin}/app/`)
    // Apple's WebKit (macOS, iOS) refuses files in a private-style context;
    // the Linux build in CI keeps them, so there is nothing to show there.
    const refused = await page.evaluate(async () => {
      try {
        const dir = await navigator.storage.getDirectory()
        await dir.getFileHandle('.probe', { create: true })
        return false
      } catch {
        return true
      }
    })
    if (!refused) {
      await ctx.close()
      test.skip()
      return
    }
    await page
      .getByRole('heading', { name: 'Ábrelo en una ventana normal' })
      .waitFor({ timeout: 30_000 })
    expect(await page.getByText(`${site.origin}/app/`).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Copiar la dirección' }).count()).toBe(1)
    await ctx.close()
  })
})
