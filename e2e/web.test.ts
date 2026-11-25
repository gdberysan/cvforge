import path from 'node:path'
import { type Browser, type BrowserContext, chromium, devices, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveSite } from './serve'

/**
 * The web edition as a person first meets it, on a phone, against the real
 * built site. The trial server and everything else off the site are faked
 * per test; a page error anywhere fails the test it happened in.
 */
let site: { origin: string; close: () => Promise<void> }
let browser: Browser

beforeAll(async () => {
  site = await serveSite(path.resolve('web/site'))
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
  await site?.close()
})

async function phone(
  opts: { locale?: string; userAgent?: string } = {},
): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    locale: opts.locale ?? 'es-MX',
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  })
  // Nothing leaves the site unless a test answers it.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort())
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, errors }
}

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

describe('the web edition on a phone', () => {
  it('opens on the free trial, in Spanish, fitting the screen', async () => {
    const { ctx, page, errors } = await phone()
    await page.goto(`${site.origin}/app/`)
    await expect(page.getByText('Pruébalo gratis.')).toBeDefined()
    await page.getByRole('button', { name: /Probar gratis con mi CV/ }).waitFor()
    expect(await overflows(page)).toBe(false)
    expect(errors).toEqual([])
    await ctx.close()
  })

  it('starts the trial and moves on to the CV', async () => {
    const { ctx, page, errors } = await phone()
    let starts = 0
    await ctx.route('**/trial/start/', (r) => {
      starts++
      return r.fulfill({
        json: {
          state: 'started',
          token: 't1.testtrialid0000000.9999999999999.sig',
          budgetUsd: 1.5,
        },
      })
    })
    await page.goto(`${site.origin}/app/`)
    await page.getByRole('button', { name: /Probar gratis con mi CV/ }).click()
    await page.getByText('Paso 2 de 3').waitFor()
    expect(starts).toBe(1)
    // The pass never shows up in the address.
    expect(page.url()).not.toContain('t1.')
    expect(errors).toEqual([])
    await ctx.close()
  })

  it('fits the trial card with its guide open on a 360 px phone', async () => {
    // 2026-11-25: "Ocultar guía" sat on the trial line, the guide spilled
    // past its card and the bar pushed EN/ES off the screen at 360 px.
    const ctx = await browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 360, height: 780 },
      locale: 'es-MX',
    })
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort())
    await ctx.route('**/trial/status/', (r) =>
      r.fulfill({ json: { leftUsd: 1.45, budgetUsd: 1.5 } }),
    )
    await ctx.route('**/trial/start/', (r) =>
      r.fulfill({
        json: {
          state: 'started',
          token: 't1.testtrialid0000000.9999999999999.sig',
          budgetUsd: 1.5,
        },
      }),
    )
    const page = await ctx.newPage()
    await page.goto(`${site.origin}/app/`)
    await page.getByRole('button', { name: /Probar gratis con mi CV/ }).click()
    await page.getByText('Paso 2 de 3').waitFor()
    await page.goto(`${site.origin}/app/settings/`)
    await page.locator('.trial-left-text').waitFor()
    await page.locator('.journey-open').first().click()
    await page.locator('.journey-fold').waitFor()
    const m = await page.evaluate(`(() => {
      var W = document.documentElement.clientWidth
      var box = function (s) { return document.querySelector(s).getBoundingClientRect() }
      var f = box('.journey-fold'), t = box('.trial-left-text'), j = box('.journey'), g = box('.settings-group')
      var cut = Array.from(document.querySelectorAll('a,button')).filter(function (e) { var r = e.getBoundingClientRect(); return r.width > 2 && (r.right > W + 1 || r.left < -1) }).length
      return { overflow: document.documentElement.scrollWidth > W, cut: cut, foldBelowTrial: f.top >= t.bottom, guideInCard: j.right <= g.right - 1 }
    })()`)
    expect(m).toEqual({ overflow: false, cut: 0, foldBelowTrial: true, guideInCard: true })
    await ctx.close()
  })

  it('says so when the trial is closed, and offers the key instead', async () => {
    const { ctx, page } = await phone()
    await ctx.route('**/trial/start/', (r) => r.fulfill({ status: 503, json: { state: 'closed' } }))
    await page.goto(`${site.origin}/app/`)
    await page.getByRole('button', { name: /Probar gratis con mi CV/ }).click()
    await page
      .getByRole('alert')
      .filter({ hasText: /cerrada/i })
      .waitFor()
    // The key is offered right there: the guide to connect one's own.
    await page.getByText('Conecta tu propia clave').first().waitFor()
    await ctx.close()
  })

  it('warns inside LinkedIn’s own browser, and only there', async () => {
    const inApp = await phone({ userAgent: `${devices['Pixel 7'].userAgent} [LinkedInApp]/9.30` })
    await inApp.page.goto(`${site.origin}/app/`)
    await inApp.page.getByText(/Estás en el navegador de LinkedIn/).waitFor()
    expect(await overflows(inApp.page)).toBe(false)
    // The way out: asks the phone for its browser; when the app keeps the
    // page (as this test browser does), it points at the app's menu instead.
    await inApp.page.getByRole('button', { name: 'Abrir en mi navegador' }).click()
    await inApp.page.getByText(/¿No se abrió\? Toca el menú de LinkedIn/).waitFor()
    expect(await overflows(inApp.page)).toBe(false)
    await inApp.ctx.close()

    const plain = await phone()
    await plain.page.goto(`${site.origin}/app/`)
    await plain.page.getByRole('button', { name: /Probar gratis con mi CV/ }).waitFor()
    expect(await plain.page.getByText(/Estás en el navegador de/).count()).toBe(0)
    await plain.ctx.close()
  })

  // 2026-11-24: on the live site Ajustes said "Esta copia no trae recibo de
  // construcción (una prueba local)": the receipt was fetched from the root,
  // which the landing owns, instead of under /app.
  it('finds its build receipt under the app, not the landing', async () => {
    const { ctx, page } = await phone()
    const asked: string[] = []
    page.on(
      'request',
      (r) => r.url().includes('build.json') && asked.push(new URL(r.url()).pathname),
    )
    await page.goto(`${site.origin}/app/settings/`)
    await page.waitForTimeout(2500)
    expect(asked.length).toBeGreaterThan(0)
    for (const path of asked) expect(path).toBe('/app/build.json')
    expect(await page.getByText(/no trae recibo/).count()).toBe(0)
    await ctx.close()
  })

  it('opens the privacy page in English, fitting the screen', async () => {
    const { ctx, page, errors } = await phone({ locale: 'en-US' })
    await page.goto(`${site.origin}/app/privacidad/`)
    await page.getByRole('heading', { level: 1 }).waitFor()
    expect(await overflows(page)).toBe(false)
    expect(errors).toEqual([])
    await ctx.close()
  })

  it('keeps the trial’s owner view shut without the right key', async () => {
    const { ctx, page } = await phone()
    await ctx.route('**/trial/ops/', (r) =>
      r.fulfill({ status: 404, json: { state: 'not-found' } }),
    )
    await page.goto(`${site.origin}/app/ops/`)
    await page.getByLabel('Clave', { exact: true }).fill('not-the-key')
    await page.getByRole('button', { name: 'Abrir' }).click()
    await page.getByText('Esa clave no abre esta vista.').waitFor()
    await ctx.close()
  })
})
