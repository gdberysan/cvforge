// kit-ui state: the landing for someone who asked for less motion: the film
// never starts on its own; the poster shows with a play button. Listed in
// .claude/ui.json; run with --state landing-film-reduced.
export async function before(ctx) {
  const host = /^https?:\/\/(127\.0\.0\.1|localhost)/
  await ctx.route(
    (u) => !host.test(u.href),
    (r) => r.abort(),
  )
}

export async function after(page, url) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${new URL(url).origin}/?inicio`)
  await page.locator('#film').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
}
