import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

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
}).listen(3988, '127.0.0.1')
const browser = await chromium.launch()
const ctx = await browser.newContext()
const open = async () => {
  const p = await ctx.newPage()
  p.on('console', (m) => console.log('  console:', m.text()))
  await p.goto('http://127.0.0.1:3988/')
  await p.waitForFunction(() => window.ready)
  return p
}
let p = await open()
console.log('1 first read :', JSON.stringify(await p.evaluate(() => window.ask('read'))))
console.log('2 write      :', JSON.stringify(await p.evaluate(() => window.ask('write'))))
await p.reload()
await p.waitForFunction(() => window.ready)
console.log('3 after reload:', JSON.stringify(await p.evaluate(() => window.ask('read'))))
await p.close()
p = await open()
console.log('4 new tab    :', JSON.stringify(await p.evaluate(() => window.ask('read'))))
await browser.close()
server.close()
