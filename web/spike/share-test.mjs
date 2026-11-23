import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, dbCopy, configFile, outDir] = process.argv.slice(2)
await mkdir(outDir, { recursive: true })
const key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const POSTING = `Especialista en Marketing de Performance
Casa Tolteca Muebles · Guadalajara, Jalisco (híbrido)

Acerca del empleo
Casa Tolteca es una marca mexicana de muebles con 14 tiendas y venta en línea. Buscamos a una persona que lleve nuestras campañas pagadas y nos ayude a crecer el canal digital con disciplina y datos.

Responsabilidades
- Planear y operar campañas en Google Ads y Meta Ads con un presupuesto mensual de $600,000 MXN.
- Construir reportes semanales de ROAS, CAC y conversión para dirección comercial.
- Coordinar con el equipo de ecommerce las promociones de temporada y el calendario de lanzamientos.
- Probar creatividades y audiencias con un método claro de experimentación.

Requisitos
- 3 años o más operando campañas de performance con presupuestos propios.
- Dominio de Google Analytics 4 y Looker Studio.
- Inglés intermedio para leer documentación y hablar con proveedores.
- Disponibilidad para ir a la oficina de Guadalajara dos días por semana.

Deseable
- Experiencia en retail o muebles.
- Conocimiento básico de SQL.

Ofrecemos
Sueldo competitivo, prestaciones superiores a las de ley y 20% de descuento en productos.`
const NOISE = [
  '54 solicitantes',
  'Solicitud sencilla',
  'Guardar',
  'Promocionado',
  'Personas que quizá conozcas',
]
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const lines = POSTING.split('\n')
const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><style>body{font:16px/1.45 -apple-system,Roboto,sans-serif;margin:0;color:#1d1d1d}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 14px;font-weight:600}main{padding:14px}h1{font-size:21px;margin:6px 0}.co{color:#555}.chip{display:inline-block;border:1px solid #0a66c2;color:#0a66c2;border-radius:16px;padding:4px 12px;margin:8px 6px 8px 0}.promo{color:#888;font-size:13px}.side{background:#f3f2ef;padding:12px;margin-top:20px;font-size:14px}</style>
<header>LinkedIn · Empleos</header><main><p class=promo>Promocionado · 54 solicitantes</p><h1>${esc(lines[0])}</h1><p class=co>${esc(lines[1])}</p><span class=chip>Solicitud sencilla</span><span class=chip>Guardar</span>
${lines
  .slice(3)
  .map((l) =>
    l.startsWith('- ')
      ? `<li>${esc(l.slice(2))}</li>`
      : l.trim() === ''
        ? ''
        : /^(Acerca|Responsabilidades|Requisitos|Deseable|Ofrecemos)/.test(l)
          ? `<h3>${esc(l)}</h3>`
          : `<p>${esc(l)}</p>`,
  )
  .join('\n')}
<div class=side><b>Personas que quizá conozcas</b><br>Ana Ruiz · Gerente de Ventas</div></main>`
const server = serve(4004)
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
// 1. screenshots of the fictional posting, as a phone would take them
const lp = await ctx.newPage()
await lp.setContent(html)
const total = await lp.evaluate(() => document.body.scrollHeight)
const vh = lp.viewportSize().height
const shots = []
for (let y = 0, i = 0; y < total; y += Math.round(vh * 0.8), i++) {
  await lp.evaluate((y) => window.scrollTo(0, y), y)
  const f = path.join(outDir, `shot-${i + 1}.png`)
  await lp.screenshot({ path: f })
  shots.push(f)
  if (y + vh >= total) break
}
await lp.close()
console.log('screenshots   :', shots.length, `(page ${total}px, viewport ${vh}px)`)
// 2. the site, with a copy of a real install and the key
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.goto('http://127.0.0.1:4004/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
await p.evaluate(
  (b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)),
  Array.from(await readFile(dbCopy)),
)
await p.evaluate((k) => window.cvforgeDebug.setApiKey(k), key)
await p.evaluate(() => navigator.serviceWorker.ready)
await p.reload()
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
console.log('service worker: controlling the page')
// 3. share them as Android does: a multipart POST to the manifest's share_target
await p.evaluate(() => {
  const f = Object.assign(document.createElement('form'), {
    method: 'POST',
    action: '/share-target',
    enctype: 'multipart/form-data',
  })
  f.id = 'sharetest'
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    name: 'shots',
    multiple: true,
  })
  const url = Object.assign(document.createElement('input'), {
    type: 'hidden',
    name: 'url',
    value: 'https://www.linkedin.com/jobs/view/4099999999/',
  })
  f.append(input, url)
  document.body.append(f)
})
await p.setInputFiles('#sharetest input[type=file]', shots)
await Promise.all([
  p.waitForURL(/\/share\/\?shared=/, { timeout: 20000 }),
  p.evaluate(() => document.getElementById('sharetest').submit()),
])
console.log(
  'shared        : landed on',
  `${new URL(p.url()).pathname + new URL(p.url()).search.slice(0, 20)}…`,
)
await p.getByRole('button', { name: 'Leer las capturas' }).waitFor({ timeout: 15000 })
console.log(
  'intake        :',
  await p.locator('.shots .fact').first().innerText(),
  '| thumbnails',
  await p.locator('.shots-strip img').count(),
)
const before = await p.evaluate(() => window.cvforgeDebug.status())
const t0 = Date.now()
await p.getByRole('button', { name: 'Leer las capturas' }).click()
await p.waitForFunction(() => (document.querySelector('textarea')?.value.length ?? 0) > 200, null, {
  timeout: 180000,
})
const text = await p.locator('textarea').first().inputValue()
console.log('read in       :', Math.round((Date.now() - t0) / 1000), 's')
const after = await p.evaluate(() => window.cvforgeDebug.status())
console.log(
  `spend         : +$${(after.spend.totalUsd - before.spend.totalUsd).toFixed(4)}`,
  `(${after.spend.calls - before.spend.calls} call)`,
)
const words = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .match(/[\p{L}\p{N}$%,.]+/gu) ?? []
const got = new Set(words(text))
const want = words(POSTING)
const recall = want.filter((w) => got.has(w)).length / want.length
console.log('word recall   :', `${(recall * 100).toFixed(1)}%`, `of ${want.length} words`)
console.log('noise kept    :', NOISE.filter((n) => text.includes(n)).join(', ') || 'none')
console.log(
  'url field     :',
  await p
    .locator('input[type=url], input[placeholder*="liga"]')
    .first()
    .inputValue()
    .catch(() => '?'),
)
console.log('page errors   :', errors.length ? errors : 'none')
await writeFile(path.join(outDir, 'transcript.txt'), text)
await writeFile(
  path.join(outDir, 'browser.db'),
  Buffer.from(await p.evaluate(async () => Array.from(await window.cvforgeDebug.exportDatabase()))),
)
await ctx.close()
server.close()
