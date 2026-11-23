import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, dbCopy, configFile, outDb] = process.argv.slice(2)
const key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const src = await readFile('lib/onboarding/sample-posting.ts', 'utf8')
const posting = src.slice(
  src.indexOf('SAMPLE_POSTING = `') + 18,
  src.indexOf('`', src.indexOf('SAMPLE_POSTING = `') + 18),
)
const server = serve(4003)
const ctx = await chromium.launchPersistentContext(profileDir, { locale: 'es-MX' })
let p = await ctx.newPage()
const t0 = Date.now()
const at = () => `${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s`
await p.goto('http://127.0.0.1:4003/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
await p.evaluate(
  (b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)),
  Array.from(await readFile(dbCopy)),
)
await p.evaluate((k) => window.cvforgeDebug.setApiKey(k), key)
const startTriage = (page, marker, variant = '') =>
  page.evaluate(
    ([text, marker]) => {
      window[marker] = 'running'
      fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, market: 'mx', source: 'other' }),
      })
        .then((r) => r.text())
        .then((t) => {
          window[marker] = /"stage":"done"|applicationId/.test(t)
            ? 'done'
            : `ended: ${t.slice(-160)}`
        })
        .catch((e) => {
          window[marker] = `error ${e}`
        })
    },
    [posting + variant, marker],
  )

// A — frozen mid-job, then back
if (!process.env.SKIP_A) {
  await p.goto('http://127.0.0.1:4003/')
  await p.waitForFunction(() => window.cvforgeDebug)
  const before = await p.evaluate(() => window.cvforgeDebug.status())
  await startTriage(p, 'A')
  await p.waitForSelector('.job-banner', { timeout: 10000 })
  console.log(at(), 'A: job running, banner:', await p.locator('.job-banner').first().innerText())
  await p.waitForTimeout(4000)
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  console.log(at(), 'A: page FROZEN (as Android does in the background)')
  await new Promise((r) => setTimeout(r, 20000))
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  console.log(at(), 'A: page active again')
  await p.waitForFunction(() => window.A !== 'running', null, { timeout: 180000 })
  console.log(
    at(),
    'A: result:',
    await p.evaluate(() => window.A),
    '| banner gone:',
    (await p.locator('.job-banner').count()) === 0,
  )
  const afterA = await p.evaluate(() => window.cvforgeDebug.status())
  console.log(
    `     spend A: +$${(afterA.spend.totalUsd - before.spend.totalUsd).toFixed(4)}`,
    `(${afterA.spend.calls - before.spend.calls} calls)`,
  )
}
// B — the page is killed mid-call
await startTriage(p, 'B', '\n\nRequisito adicional: experiencia con Shopify Plus y Klaviyo.')
await p.waitForTimeout(3500)
console.log(at(), 'B: closing the page mid-call')
await p.close()
p = await ctx.newPage()
await p.goto('http://127.0.0.1:4003/')
await p.waitForSelector('.job-banner.is-warning', { timeout: 20000 }).then(
  () => {},
  () => {},
)
console.log(
  at(),
  'B: on reopen:',
  (
    await p
      .locator('.job-banner.is-warning')
      .innerText()
      .catch(() => 'NO NOTICE')
  ).replace(/\s+/g, ' '),
)
await p.goto('http://127.0.0.1:4003/settings/')
await p.waitForTimeout(2500)
const settingsText = (await p.locator('main').innerText()).replace(/\s+/g, ' ')
console.log(
  at(),
  'B: Ajustes:',
  settingsText.match(/Llamadas con costo desconocido[^.]*\./)?.[0] ?? 'NO UNKNOWN-COST LINE',
)
const status = await p.evaluate(() => window.cvforgeDebug.status())
console.log('     spend now:', JSON.stringify(status.spend))
await writeFile(
  outDb,
  Buffer.from(await p.evaluate(async () => Array.from(await window.cvforgeDebug.exportDatabase()))),
)
await ctx.close()
server.close()
