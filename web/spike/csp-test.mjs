import { readFile } from 'node:fs/promises'
import { chromium, devices } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, dbCopy, configFile, ...paths] = process.argv.slice(2)
const key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const server = serve(4008)
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
await ctx.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__violations.push(
      `${e.violatedDirective} ← ${e.blockedURI || 'inline'} @ ${location.pathname}`,
    ),
  )
})
const p = await ctx.newPage()
const all = []
p.on('console', (m) => {
  if (/Content Security Policy|Refused to/.test(m.text())) all.push(m.text().slice(0, 200))
})
p.on('pageerror', (e) => all.push(`PAGEERROR ${e.message.slice(0, 160)}`))
await p.goto('http://127.0.0.1:4008/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const h = (await fetch('http://127.0.0.1:4008/')).headers
console.log(
  'headers on / :',
  h.get('content-security-policy'),
  '|',
  h.get('referrer-policy'),
  '|',
  h.get('x-content-type-options'),
)
console.log(
  'worker policy:',
  (await fetch('http://127.0.0.1:4008/worker/cvforge-worker.js')).headers.get(
    'content-security-policy',
  ),
)
await p.evaluate(
  (b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)),
  Array.from(await readFile(dbCopy)),
)
// the Worker reaches Anthropic (the free key check) under its own policy
const saved = await p.evaluate(
  (k) => window.cvforgeDebug.action('settings', 'saveApiKeyAction', [k]),
  key,
)
console.log('key check from the Worker (api.anthropic.com):', JSON.stringify(saved))
for (const route of paths) {
  await p.goto(`http://127.0.0.1:4008${route}`)
  await p
    .waitForFunction(() => (document.querySelector('main')?.innerText.length ?? 0) > 40, null, {
      timeout: 20000,
    })
    .catch(() => {})
  await p.waitForTimeout(500)
  const v = await p.evaluate(() => window.__violations)
  const len = (
    await p
      .locator('main')
      .first()
      .innerText()
      .catch(() => '')
  ).length
  console.log(
    `${route.padEnd(60)} ${String(len).padStart(5)} chars  violations: ${v.length ? v.join(' | ') : 'none'}`,
  )
}
console.log('console CSP/page errors:', all.length ? [...new Set(all)].slice(0, 8) : 'none')
await ctx.close()
server.close()
