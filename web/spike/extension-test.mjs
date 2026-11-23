import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir] = process.argv.slice(2)
const ext = path.resolve('web/extension/dist')
const site = serve(4006)
const JOB = `<!doctype html><meta charset=utf-8><title>Empleo</title><header>LinkedIn · Empleos</header><main>
<div class="jobs-details"><div class="job-details-jobs-unified-top-card__job-title"><h1>Especialista en Performance</h1></div>
<div class="job-details-jobs-unified-top-card__company-name">Casa Tolteca</div>
<button>Solicitud sencilla</button>
<div id="job-details"><h2>Acerca del empleo</h2><p>Buscamos a una persona que lleve nuestras campañas pagadas en Google Ads y Meta Ads, con un presupuesto mensual de $600,000 MXN.</p><h3>Requisitos</h3><ul><li>3 años operando campañas de performance.</li><li>Dominio de Google Analytics 4 y Looker Studio.</li></ul></div></div></main>`
const fake = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(JOB)
}).listen(4007, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  locale: 'es-MX',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
let [sw] = ctx.serviceWorkers()
sw ??= await ctx.waitForEvent('serviceworker')
const extId = new URL(sw.url()).host
// the site once, so the browser has a database (a person who has used CVForge)
const s = await ctx.newPage()
await s.goto('http://127.0.0.1:4006/')
await s.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
await s.close()
const job = await ctx.newPage()
await job.goto('http://127.0.0.1:4007/jobs/view/123/')
await job.waitForSelector('#cvforge-analyse', { timeout: 10000 })
console.log('button        : shown beside the title')
await job.evaluate(() => document.getElementById('cvforge-analyse')?.remove())
await job.waitForSelector('#cvforge-analyse', { timeout: 5000 }).then(
  () => console.log('button        : back after the page dropped it (SPA)'),
  () => console.log('button        : NOT restored'),
)
await job.locator('#cvforge-analyse').click()
await job.waitForTimeout(800)
const pending = await sw.evaluate(() => chrome.storage.session.get('pending'))
const posting = pending?.pending?.posting
console.log(
  'click         : posting handed over —',
  posting
    ? `${posting.source}, ${posting.text.length} chars, has budget line: ${/600,000 MXN/.test(posting.text)}, button text left out: ${!/Solicitud sencilla/.test(posting.text)}`
    : 'NOTHING',
)
const panel = await ctx.newPage()
await panel.goto(`chrome-extension://${extId}/panel.html`)
const frame = await (await panel.waitForSelector('#site')).contentFrame()
await frame.waitForSelector('textarea', { timeout: 20000 })
const value = await frame.locator('textarea').first().inputValue()
console.log(
  'side panel    : CVForge framed at',
  new URL(frame.url()).pathname,
  '| box prefilled:',
  value.includes('Especialista en Performance') && value.includes('Looker Studio'),
)
await ctx.close()
site.close()
fake.close()
