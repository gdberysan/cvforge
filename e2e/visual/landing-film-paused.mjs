// kit-ui state: the landing's film scrolled into view and paused with its own
// button (the button then offers play). Listed in .claude/ui.json; run with
// ~/.claude/skills/kit-ui/run.mjs <url> <outDir> --state landing-film-paused
// against the served web/site.
export async function before(ctx) {
  const host = /^https?:\/\/(127\.0\.0\.1|localhost)/
  await ctx.route(
    (u) => !host.test(u.href),
    (r) => r.abort(),
  )
}

export async function after(page, url) {
  await page.goto(`${new URL(url).origin}/?inicio`)
  await page.locator('#film').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await page.locator('#film-toggle').click()
  await page.waitForTimeout(400)
}
