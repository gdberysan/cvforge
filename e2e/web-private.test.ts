import path from 'node:path'
import { type Browser, devices, webkit } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveSite } from './serve'

/**
 * Safari's engine in a private-style window: Apple's WebKit refuses to keep
 * files there. Before the 2026-11 launch that showed "your data could not be
 * opened, reload", which no reload fixes. Whatever the platform does, a
 * private window is never a dead end: the app opens, or it says to open the
 * address in a normal window.
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

describe('the web edition in a private-style window', () => {
  it('opens, or says to open it in a normal window with the address to copy', async () => {
    const { defaultBrowserType: _, ...iphone } = devices['iPhone 15']
    const ctx = await browser.newContext({ ...iphone, locale: 'es-MX' })
    const page = await ctx.newPage()
    await page.goto(`${site.origin}/app/`)
    const way = page
      .getByRole('heading', { name: 'Ábrelo en una ventana normal' })
      .or(page.getByRole('button', { name: /Probar gratis con mi CV/ }))
    const shown = await way
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    const text = await page
      .locator('main')
      .innerText()
      .catch(() => '')
    expect(shown, `neither way shown; the screen says: ${text.slice(0, 300)}`).toBe(true)
    if (await page.getByRole('heading', { name: 'Ábrelo en una ventana normal' }).count()) {
      expect(await page.getByText(`${site.origin}/app/`).count()).toBe(1)
      expect(await page.getByRole('button', { name: 'Copiar la dirección' }).count()).toBe(1)
    }
    expect(text).not.toContain('No se pudieron abrir tus datos')
    await ctx.close()
  })
})
