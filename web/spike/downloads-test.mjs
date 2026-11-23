import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, dbCopy, appId] = process.argv.slice(2)
const server = serve(4002)
const ctx = await chromium.launchPersistentContext(profileDir, {
  locale: 'es-MX',
  acceptDownloads: true,
})
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.goto('http://127.0.0.1:4002/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
await p.evaluate(
  (b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)),
  Array.from(await readFile(dbCopy)),
)
await p.goto(`http://127.0.0.1:4002/application/${appId}/?step=docs`)
const frame = p.locator('iframe.pdf-html-preview')
await frame.waitFor({ timeout: 20000 }).then(
  () => {},
  () => {},
)
const src = await frame.getAttribute('srcdoc').catch(() => null)
console.log(
  'docs preview  :',
  src ? `HTML ${src.length} chars, has <h1>: ${/<h1/.test(src)}` : 'NOT SHOWN',
)
await p.goto(`http://127.0.0.1:4002/application/${appId}/?step=send`)
await p.getByRole('link', { name: 'DOCX' }).waitFor({ timeout: 20000 })
const [dl] = await Promise.all([
  p.waitForEvent('download', { timeout: 20000 }),
  p.getByRole('link', { name: 'DOCX' }).click(),
])
const bytes = await readFile(await dl.path())
console.log(
  'docx download :',
  dl.suggestedFilename(),
  bytes.length,
  'bytes, zip header:',
  bytes.subarray(0, 2).toString() === 'PK',
)
await p.evaluate(() => {
  window.__printed = 0
  const _orig = HTMLIFrameElement.prototype
  const obs = new MutationObserver(() => {
    if (document.querySelector('iframe[aria-hidden="true"][srcdoc]')) window.__printed++
  })
  obs.observe(document.body, { childList: true })
})
await p.getByRole('link', { name: 'PDF' }).click()
await p
  .waitForFunction(() => window.__printed > 0, null, { timeout: 15000 })
  .then(
    () => console.log('pdf link      : print frame opened with the CV'),
    () => console.log('pdf link      : NO print frame'),
  )
console.log('page errors   :', errors.length ? errors : 'none')
await ctx.close()
server.close()
