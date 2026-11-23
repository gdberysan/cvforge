import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, webkit } from 'playwright'

const engine = process.argv[2] ?? 'chromium'
const root = path.resolve('web/spike/dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' }
const server = createServer(async (req, res) => {
  const f = path.join(root, req.url.split('?')[0])
  try {
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
    res.end(await readFile(f))
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(3993, '127.0.0.1')
const ctx = await { chromium, webkit }[engine].launchPersistentContext(process.argv[3])
const open = async () => {
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:3993/tabs.html')
  await p.waitForFunction(() => window.ready)
  return p
}
const a = await open()
console.log('A claim       :', JSON.stringify(await a.evaluate(() => window.claim())))
await a.evaluate(() => window.call('save', { name: 'Written by A' }))
const b = await open()
console.log('B claim       :', JSON.stringify(await b.evaluate(() => window.claim())))
console.log('B read (none) :', await b.evaluate(() => window.call('read')))
const t0 = Date.now()
console.log(
  'B use it here :',
  JSON.stringify(await b.evaluate(() => window.claim(true))),
  `${Date.now() - t0} ms`,
)
await a.waitForFunction(() => window.events.includes('lost'), null, { timeout: 5000 })
console.log('A events      :', JSON.stringify(await a.evaluate(() => window.events)))
console.log('A read after  :', await a.evaluate(() => window.call('read')))
console.log('B read        :', await b.evaluate(() => window.call('read')))
await b.evaluate(() => window.call('save', { name: 'Written by B' }))
await b.close()
const c = await open()
console.log('C claim       :', JSON.stringify(await c.evaluate(() => window.claim())))
console.log('C read        :', await c.evaluate(() => window.call('read')))
await ctx.close()
server.close()
