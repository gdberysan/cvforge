import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const root = path.resolve('web/out')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}
const server = createServer(async (req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]))
  try {
    if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html')
  } catch {}
  let b
  try {
    b = await readFile(f)
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
  res.end(b)
}).listen(3998, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(process.argv[2], {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
const p = await ctx.newPage()
const logs = []
p.on('pageerror', (e) => logs.push(`PAGEERROR ${e.message}`))
p.on('console', (m) => logs.push(`${m.type()} ${m.text()}`))
p.on('requestfailed', (r) => logs.push(`FAILED ${r.url()}`))
p.on('response', (r) => {
  if (r.status() >= 400) logs.push(`${r.status()} ${r.url()}`)
})
await p.goto('http://127.0.0.1:3998/')
await p.waitForTimeout(4000)
if (process.argv[3]) {
  const key = JSON.parse(
    await (await import('node:fs/promises')).readFile(process.argv[3], 'utf8'),
  ).anthropicApiKey
  await p.getByLabel('Clave de API').fill(key)
  await p.getByRole('button', { name: 'Verificar y guardar' }).click()
  await p.waitForTimeout(8000)
}
console.log((await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400))
console.log(logs.slice(0, 12).join('\n'))
await ctx.close()
server.close()
