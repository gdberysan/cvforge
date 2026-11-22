import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, webkit } from 'playwright'

const [engine, profile] = process.argv.slice(2)
const root = path.resolve('web/out')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}
const server = createServer(async (req, res) => {
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
}).listen(3995, '127.0.0.1')
const ctx = await { chromium, webkit }[engine].launchPersistentContext(profile, { locale: 'es-MX' })
const errors = []
const open = async () => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto('http://127.0.0.1:3995/')
  return p
}
const text = (p) => p.locator('main').innerText()
const a = await open()
await a.waitForSelector('[data-testid=ready]', { timeout: 20000 })
console.log('A first visit :', (await text(a)).replace(/\s+/g, ' '))
await a.reload()
await a.waitForSelector('[data-testid=ready]', { timeout: 20000 })
console.log('A reload      :', (await text(a)).replace(/\s+/g, ' ').slice(0, 80))
const b = await open()
await b.getByRole('button', { name: 'Usarlo aquí' }).waitFor({ timeout: 10000 })
console.log('B             :', (await text(b)).replace(/\s+/g, ' '))
await b.getByRole('button', { name: 'Usarlo aquí' }).click()
await b.waitForSelector('[data-testid=ready]', { timeout: 20000 })
await a.waitForFunction(
  () => document.querySelector('main')?.innerText.includes('otra pestaña'),
  null,
  { timeout: 10000 },
)
console.log('B after take  :', (await text(b)).replace(/\s+/g, ' ').slice(0, 60))
console.log('A after take  :', (await text(a)).replace(/\s+/g, ' '))
console.log('page errors   :', errors.length ? errors : 'none')
await ctx.close()
server.close()
