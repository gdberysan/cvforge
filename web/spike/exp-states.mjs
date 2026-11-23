/** Mi experiencia states: default, filtered by the strength button, an entry open, a job being edited, "Cómo se calcula" open. */
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const [out, dbFile] = process.argv.slice(2)
const base = 'http://127.0.0.1:4100'
await mkdir(out, { recursive: true })
const bytes = Array.from(await readFile(dbFile))
for (const [vp, opts] of Object.entries({
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { ...devices['Pixel 7'] },
})) {
  const profile = path.join(out, `.p-${vp}`)
  const ctx = await chromium.launchPersistentContext(profile, { ...opts, locale: 'es-MX' })
  const p = await ctx.newPage()
  await p.goto(`${base}/`)
  await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
  await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes)
  const go = async () => {
    await p.goto(`${base}/evidence/`)
    await p.waitForSelector('.strength-card')
    await p.waitForTimeout(800)
  }
  const shot = (n, full = true) =>
    p.screenshot({ path: path.join(out, `${vp}--${n}.png`), fullPage: full })
  await go()
  await shot('default')
  await p.click('.strength-act')
  await p.waitForTimeout(900)
  await shot('filtered', false)
  await go()
  await p.click('.strength-how > summary')
  await p.waitForTimeout(300)
  await p.locator('.strength-card').screenshot({ path: path.join(out, `${vp}--how.png`) })
  await go()
  await p.locator('.rec-edit-btn').first().click()
  await p.waitForTimeout(500)
  await p
    .locator('.role-section')
    .first()
    .screenshot({ path: path.join(out, `${vp}--entry-open.png`) })
  await go()
  await p.locator('.role-foot .action').nth(1).click()
  await p.waitForTimeout(400)
  await p
    .locator('.role-section')
    .first()
    .screenshot({ path: path.join(out, `${vp}--job-edit.png`) })
  await go()
  await p.locator('.role-open').nth(1).click()
  await p.waitForTimeout(400)
  await p
    .locator('.role-section')
    .nth(1)
    .screenshot({ path: path.join(out, `${vp}--job2-open.png`) })
  await go()
  await p.locator('.details-card .btn-quiet').first().click()
  await p.waitForTimeout(400)
  await p.locator('.details-card').screenshot({ path: path.join(out, `${vp}--profile-edit.png`) })
  await ctx.close()
  await rm(profile, { recursive: true, force: true })
}
console.log('done')
