import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

const [profileDir, dbCopy, configFile] = process.argv.slice(2)
const key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const src = await readFile('lib/onboarding/sample-posting.ts', 'utf8')
const posting = src.slice(
  src.indexOf('SAMPLE_POSTING = `') + 18,
  src.indexOf('`', src.indexOf('SAMPLE_POSTING = `') + 18),
)
const root = path.resolve('web/out')
const RAW = `<!doctype html><meta charset="utf-8"><script type="module">
const w = new Worker('/worker/cvforge-worker.js', { type: 'module' }); let seq = 0
window.rpc = (method, args, onProgress) => new Promise((res, rej) => { const id = ++seq
  const l = (e) => { const r = e.data; if (r.id !== id) return; if (r.kind === 'progress') { onProgress && onProgress(r.value); return }
    w.removeEventListener('message', l); r.kind === 'result' ? res(r.value) : rej(new Error(JSON.stringify(r.error))) }
  w.addEventListener('message', l); const at = args.findIndex((a) => a === '__P__'); w.postMessage({ id, method, args, progressAt: at >= 0 ? at : null }) })
window.ready = true</script>`
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' }
const server = createServer(async (req, res) => {
  if (req.url === '/raw.html') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(RAW)
    return
  }
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]))
  try {
    if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html')
  } catch {}
  try {
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
    res.end(await readFile(f))
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(3996, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(profileDir)
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:3996/raw.html')
await p.waitForFunction(() => window.ready)
const rpc = (m, a) => p.evaluate(([m, a]) => window.rpc(m, a), [m, a])
await rpc('open', [])
await rpc('setLocale', ['es'])
const details = {
  location: 'Bogotá, Colombia',
  timezone: 'America/Bogota',
  markets: ['co', 'us-remote'],
  workAuthorization: [],
}
console.log(
  '1 action, no profile :',
  JSON.stringify(await rpc('action', ['evidence', 'saveDetailsAction', [details]])),
)
const bytes = Array.from(await readFile(dbCopy))
console.log(
  '2 import desktop     :',
  JSON.stringify(await p.evaluate((b) => window.rpc('importDatabase', [new Uint8Array(b)]), bytes)),
)
console.log(
  '3 action, profile    :',
  JSON.stringify(
    await rpc('action', [
      'evidence',
      'saveDetailsAction',
      [
        {
          ...details,
          markets: ['mx', 'us-remote'],
          location: 'CDMX',
          timezone: 'America/Mexico_City',
        },
      ],
    ]),
  ),
)
const routeOnce = (path, req) =>
  p.evaluate(
    ([path, req]) => {
      const ev = []
      return window
        .rpc('route', [path, req, '__P__'], (e) =>
          ev.push(
            e.kind === 'chunk' ? { kind: 'chunk', text: new TextDecoder().decode(e.bytes) } : e,
          ),
        )
        .then(() => ev)
    },
    [path, req],
  )
const kit = await routeOnce('/api/kit/status?applicationId=none', {
  method: 'GET',
  headers: [],
  body: null,
})
console.log('4 GET route          :', JSON.stringify(kit).slice(0, 200))
await rpc('setApiKey', [key])
const before = await rpc('status', [])
const t0 = Date.now()
const events = await routeOnce('/api/ai/triage', {
  method: 'POST',
  headers: [['content-type', 'application/json']],
  body: JSON.stringify({ text: posting, market: 'mx', source: 'other' }),
})
const sse = events
  .filter((e) => e.kind === 'chunk')
  .map((e) => e.text)
  .join('')
  .split('\n\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l.replace(/^data: /, '')))
console.log('5 triage head        :', JSON.stringify(events[0]))
console.log(
  '  stream events      :',
  sse
    .map(
      (e) =>
        e.stage ??
        (e.error ? `ERROR ${e.code}: ${e.error}` : (e.verdict ?? Object.keys(e).join('+'))),
    )
    .join(' → '),
)
const after = await rpc('status', [])
console.log(
  '  seconds            :',
  Math.round((Date.now() - t0) / 1000),
  '| spend added $',
  (after.spend.totalUsd - before.spend.totalUsd).toFixed(4),
  '| calls added',
  after.spend.calls - before.spend.calls,
)
const last = await rpc('action', ['pipeline', '__none__', []]).catch((e) => e.message)
console.log('6 unknown action     :', last.slice(0, 90))
await ctx.close()
server.close()
