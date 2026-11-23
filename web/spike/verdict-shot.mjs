import { readFile } from 'node:fs/promises'
import { chromium, devices } from 'playwright'

const [base, postingFile, out] = process.argv.slice(2)
const b = await chromium.launch()
const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'es-MX' })).newPage()
await p.goto(`${base}/`, { waitUntil: 'networkidle' })
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
await p.getByRole('textbox', { name: /vacante|posting/i }).fill(await readFile(postingFile, 'utf8'))
await p.getByRole('button', { name: /^Analizar$|^Analyse$/ }).click()
await p.locator('.answer-card').waitFor({ timeout: 60000 })
await p.waitForTimeout(1500)
console.log((await p.locator('.intake-status').innerText()).slice(0, 120))
await p.locator('.answer-card').screenshot({ path: `${out}/answer.png` })
await p
  .locator('.answer-card summary')
  .first()
  .click()
  .catch(() => {})
await p.waitForTimeout(400)
await p.locator('.answer-card').screenshot({ path: `${out}/answer-open.png` })
await b.close()
