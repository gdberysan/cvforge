/** Shots of the print-shop moments, by logging outcomes on a scratch copy. */
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
  const fresh = async () => {
    await p.goto(`${base}/`)
    await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
    await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes)
  }
  const shot = async (name, appId, label) => {
    await fresh()
    await p.goto(`${base}/application/${appId}/`)
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(1500)
    const btn = p.locator('button', { hasText: label }).first()
    await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await btn.click()
    await p.waitForSelector('.moment', { timeout: 10000 })
    await p.waitForTimeout(2200)
    await p.screenshot({ path: path.join(out, `${vp}--${name}.png`) })
    const vpH = p.viewportSize().height
    console.log(
      vp,
      name,
      'top element at the bar:',
      await p.evaluate((y) => document.elementFromPoint(100, y)?.className, vpH - 40),
    )
  }
  await shot('sent', 'app_7b204c4b-af80-427c-90eb-b6fc93e7a46a', /la envi/i)
  await shot('loss', 'app_313b9548-7dd5-4572-aa4b-a0a258930b77', /rechazada/i)
  await shot('interview', 'app_b60314e4-082f-437a-be25-b0f18824c0bf', /entrevista/i)
  // The offer: on the same application, now interviewing, once the
  // interview moment is closed.
  await p.keyboard.press('Escape')
  await p.waitForTimeout(1500)
  const offer = p.locator('button', { hasText: /oferta/i }).first()
  await offer.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await offer.click()
  await p.waitForSelector('.moment-offer', { timeout: 10000 })
  await p.waitForTimeout(2200)
  await p.screenshot({ path: path.join(out, `${vp}--offer.png`) })
  await ctx.close()
  await rm(profile, { recursive: true, force: true })
}
console.log('done')
