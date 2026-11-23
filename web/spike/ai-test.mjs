import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

const key = JSON.parse(await readFile(process.argv[2], 'utf8')).anthropicApiKey
const root = path.resolve('web/spike/dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' }
const server = createServer(async (req, res) => {
  const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0])
  try {
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
    res.end(await readFile(f))
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(3992, '127.0.0.1')
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const calls = []
p.on('request', (r) => {
  if (r.url().includes('anthropic')) calls.push(r.url())
})
await p.goto('http://127.0.0.1:3992/')
await p.waitForFunction(() => window.ready)
const res = await p.evaluate((k) => window.ask({ kind: 'ai', key: k }), key)
console.log(JSON.stringify(res))
console.log('requests to:', [...new Set(calls)].join(', '))
await b.close()
server.close()
