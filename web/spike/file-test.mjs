import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, webkit } from 'playwright'

const [engine, profile, desktopDb, outFile] = process.argv.slice(2)
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
}).listen(3994, '127.0.0.1')
const ctx = await { chromium, webkit }[engine].launchPersistentContext(profile)
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:3994/tabs.html')
await p.waitForFunction(() => window.ready)
await p.evaluate(() => window.claim())
await p.evaluate(() => window.call('save', { name: 'Web-only data' }))
console.log('persist granted :', await p.evaluate(() => navigator.storage.persist()))
const send = (bytes) =>
  p.evaluate((arr) => window.call('import', { bytes: new Uint8Array(arr) }), Array.from(bytes))
console.log(
  'import garbage  :',
  JSON.stringify(await send(Buffer.from('not a database at all'.padEnd(500)))),
)
console.log('still ours      :', await p.evaluate(() => window.call('read')))
const desktop = await readFile(desktopDb)
console.log('import desktop  :', JSON.stringify(await send(desktop)))
console.log('profile now     :', JSON.stringify(await p.evaluate(() => window.call('read'))))
console.log('counts          :', JSON.stringify(await p.evaluate(() => window.call('counts'))))
await p.reload()
await p.waitForFunction(() => window.ready)
await p.evaluate(() => window.claim())
console.log('after reload    :', JSON.stringify(await p.evaluate(() => window.call('counts'))))
const exported = await p.evaluate(async () => Array.from(await window.call('export')))
await writeFile(outFile, Buffer.from(exported))
console.log('exported bytes  :', exported.length)
await ctx.close()
server.close()
