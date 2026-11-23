import path from 'node:path'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir] = process.argv.slice(2)
const ext = path.resolve('web/spike/ext-probe')
const server = serve(4005)
const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
let [sw] = ctx.serviceWorkers()
sw ??= await ctx.waitForEvent('serviceworker')
const extId = new URL(sw.url()).host
console.log('extension loaded:', extId)
// 1. the site in its own tab: write a setting (the API key) to its OPFS
const site = await ctx.newPage()
await site.goto('http://127.0.0.1:4005/')
await site.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
await site.evaluate(() => window.cvforgeDebug.setApiKey('sk-ant-storage-probe'))
console.log(
  'site tab        : hasKey =',
  (await site.evaluate(() => window.cvforgeDebug.status())).hasKey,
)
await site.close()
// 2. the extension's panel page, embedding the site
const panel = await ctx.newPage()
await panel.goto(`chrome-extension://${extId}/panel.html`)
const frame = await (await panel.waitForSelector('#site')).contentFrame()
await frame.waitForFunction(() => window.cvforgeDebug || document.querySelector('main'), null, {
  timeout: 20000,
})
await frame.waitForTimeout(3000)
const seen = await frame.evaluate(async () =>
  window.cvforgeDebug ? (await window.cvforgeDebug.status()).hasKey : 'no debug handle',
)
console.log(
  'embedded in ext : hasKey =',
  seen,
  seen === true ? '→ SAME storage (unpartitioned)' : '→ partitioned or not opened',
)
console.log(
  'embedded text   :',
  (await frame.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 140),
)
await ctx.close()
server.close()
