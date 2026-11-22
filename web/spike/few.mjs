/**
 * A quick look at a few pages after a change: imports the database once,
 * then a full-page shot of each path at desktop and phone width.
 *   node web/spike/few.mjs <out-dir> <db-file> <path> [<path>…]
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const [out, dbFile, ...paths] = process.argv.slice(2)
const base = 'http://127.0.0.1:4100'
await mkdir(out, { recursive: true })
const bytes = Array.from(await readFile(dbFile))
const VPS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { ...devices['Pixel 7'] },
}
for (const [vp, opts] of Object.entries(VPS)) {
  const profile = path.join(out, `.profile-${vp}`)
  const ctx = await chromium.launchPersistentContext(profile, { ...opts, locale: 'es-MX' })
  const p = await ctx.newPage()
  await p.goto(`${base}/`)
  await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
  await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes)
  for (const route of paths) {
    await p.goto(base + route)
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(1200)
    const name = route.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'hoy'
    await p.screenshot({ path: path.join(out, `${vp}--${name}.png`), fullPage: true })
  }
  await ctx.close()
  await rm(profile, { recursive: true, force: true })
}
console.log('done')
