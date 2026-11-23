import { readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const [profileDir, configFile, outDir] = process.argv.slice(2)
const _key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const _CV = `Lucía Ferrer Ibáñez
Gerente de Marketing de Performance · Bogotá, Colombia · lucia.ferrer@example.com

EXPERIENCIA
Gerente de Marketing de Performance — Tienda Nórdica (ecommerce de hogar), Bogotá. Mar 2021 – actual
- Dirigí la inversión en Google Ads y Meta Ads con un presupuesto mensual de COP 180 millones.
- Reduje el costo por adquisición 27% en 2023 al rediseñar la estructura de campañas.
- Coordiné un equipo de 3 analistas y una agencia externa.

Analista de Marketing Digital — Viajes Altiplano, Medellín. Feb 2018 – Feb 2021
- Gestioné campañas de búsqueda y remarketing para 12 destinos.
- Construí reportes semanales en Looker Studio para dirección.

EDUCACIÓN
Administración de Empresas, Universidad de Antioquia, 2017

IDIOMAS
Español nativo · Inglés B2`
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
  let body
  try {
    body = await readFile(f)
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
  res.end(body)
}).listen(3998, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const shot = (n) => p.screenshot({ path: path.join(outDir, `${n}.png`), fullPage: true })
const t0 = Date.now()
const at = () => `${Math.round((Date.now() - t0) / 1000)}s`
await p.goto('http://127.0.0.1:3998/')
await p.getByRole('button', { name: 'Analizar esta vacante' }).waitFor({ timeout: 30000 })
console.log(at(), '4 home after import: the analyse box')
await shot('4-home')
await p.goto('http://127.0.0.1:3998/?sample=1')
await p.getByRole('button', { name: 'Analizar esta vacante' }).waitFor({ timeout: 20000 })
await p.getByRole('button', { name: 'Analizar esta vacante' }).click()
await p.waitForFunction(
  () =>
    /vale la pena|alcanza|fuerte|no aplica|stretch|worth/i.test(
      document.querySelector('main')?.innerText ?? '',
    ) && !/Analizando|Extrayendo|Comparando/.test(document.querySelector('main')?.innerText ?? ''),
  null,
  { timeout: 180000 },
)
console.log(at(), '5 verdict shown')
await shot('5-verdict')
console.log(
  'verdict text:',
  (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300),
)
const status = await p.evaluate(() => window.cvforgeDebug.status())
console.log('spend in browser:', JSON.stringify(status.spend))
const bytes = await p.evaluate(async () => Array.from(await window.cvforgeDebug.exportDatabase()))
await writeFile(path.join(outDir, 'browser.db'), Buffer.from(bytes))
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none')
await ctx.close()
server.close()
