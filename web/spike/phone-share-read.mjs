import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const [refFile, outDir] = process.argv.slice(2)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = browser.contexts()[0]
const p = ctx.pages().find((x) => x.url().includes('/share/?shared='))
if (!p) throw new Error('no share page')
await p.bringToFront()
const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ')
await p.waitForTimeout(2500)
let body = await text()
if (/another tab|otra pestaña/i.test(body)) {
  console.log('state    : busy (another tab owns the data) → taking over')
  await p.getByRole('button', { name: /Use it here|Usarlo aquí/ }).click()
  await p.waitForTimeout(3000)
  body = await text()
}
console.log(
  'intake   :',
  (body.match(/\d+ screenshot\(s\)[^.]*|\d+ captura\(s\)[^.]*/) ?? ['?'])[0],
  '| thumbnails',
  await p.locator('.shots-strip img').count(),
)
const before = await p.evaluate(() => window.cvforgeDebug.status())
const t0 = Date.now()
await p.getByRole('button', { name: /Read the screenshots|Leer las capturas/ }).click()
await p.waitForFunction(() => (document.querySelector('textarea')?.value.length ?? 0) > 300, null, {
  timeout: 240000,
})
const got = await p.locator('textarea').first().inputValue()
const after = await p.evaluate(() => window.cvforgeDebug.status())
console.log(
  'read in  :',
  Math.round((Date.now() - t0) / 1000),
  `s | spend +$${(after.spend.totalUsd - before.spend.totalUsd).toFixed(4)}`,
  `(${after.spend.calls - before.spend.calls} call)`,
)
const note = await p.locator('.intake-note').allInnerTexts()
console.log('notes    :', note.join(' | ') || 'none')
const ref = await readFile(refFile, 'utf8')
const words = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .match(/[\p{L}\p{N}$%]+/gu) ?? []
const have = new Set(words(got))
const want = words(ref)
const recall = want.filter((w) => have.has(w)).length / want.length
console.log(
  'recall   :',
  `${(recall * 100).toFixed(1)}% of`,
  want.length,
  'words of LinkedIn’s own text',
)
const chrome = [
  'Solicitar',
  'Guardado',
  'personas han hecho clic',
  'Promocionado',
  'Leticia',
  'Usa la IA',
  'Establecer una alerta',
  'seguidores',
  'Acerca de la empresa',
]
console.log(
  'chrome   :',
  chrome.filter((c) => got.includes(c)).join(', ') || 'none of LinkedIn’s interface',
)
console.log('starts   :', got.slice(0, 160).replace(/\n/g, ' / '))
console.log('ends     :', got.slice(-140).replace(/\n/g, ' / '))
await writeFile(`${outDir}/phone-transcript.txt`, got)
await writeFile(
  `${outDir}/phone.db`,
  Buffer.from(await p.evaluate(async () => Array.from(await window.cvforgeDebug.exportDatabase()))),
)
await browser.close()
