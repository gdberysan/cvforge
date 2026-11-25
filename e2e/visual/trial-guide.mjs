// revision-visual state: the free trial running, Ajustes, the key guide opened
// from its folded card (the trial card's "Ocultar guía" layout). Use with
// measure.mjs --setup e2e/visual/trial-guide.mjs against the served web/site.
const TOKEN = 't1.testtrialid0000000.9999999999999.sig'

export async function before(ctx) {
  const host = /^https?:\/\/(127\.0\.0\.1|localhost)/
  await ctx.route(
    (u) => !host.test(u.href),
    (r) => r.abort(),
  )
  await ctx.route('**/trial/status/', (r) => r.fulfill({ json: { leftUsd: 1.45, budgetUsd: 1.5 } }))
  await ctx.route('**/trial/start/', (r) =>
    r.fulfill({ json: { state: 'started', token: TOKEN, budgetUsd: 1.5 } }),
  )
}

export async function after(page, url) {
  const origin = new URL(url).origin
  await page.goto(`${origin}/app/`)
  await page.getByRole('button', { name: /Probar gratis con mi CV|Try it free with my CV/ }).click()
  await page.waitForURL(/\/app\/(?!$)/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.goto(`${origin}/app/settings/`)
  await page.locator('.journey-open').first().click()
  await page.locator('.journey-fold').waitFor()
}
