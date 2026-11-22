// Loads a copy of a real install into a fresh browser profile and opens
// screens of the built site, reporting what each rendered and any page error.
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, dbCopy, shotsDir, ...paths] = process.argv.slice(2)
const server = serve(4001)
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
const p = await ctx.newPage()
let errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => {
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text())
})
await p.goto('http://127.0.0.1:4001/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const bytes = Array.from(await readFile(dbCopy))
console.log(
  'import:',
  JSON.stringify(
    await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes),
  ),
)
await mkdir(shotsDir, { recursive: true })
let n = 0
for (const route of paths) {
  errors = []
  await p.goto(`http://127.0.0.1:4001${route}`)
  await p
    .waitForFunction(() => (document.querySelector('main')?.innerText.length ?? 0) > 40, null, {
      timeout: 20000,
    })
    .catch(() => {})
  await p.waitForTimeout(400)
  const text = (
    (await p
      .locator('main')
      .first()
      .innerText()
      .catch(() => '')) || ''
  ).replace(/\s+/g, ' ')
  console.log(
    `${route.padEnd(70)} ${String(text.length).padStart(5)} chars ${errors.length ? `ERRORS ${errors.slice(0, 2).join(' | ').slice(0, 200)}` : 'ok'} | ${text.slice(0, 70)}`,
  )
  if (n++ < 4) await p.screenshot({ path: path.join(shotsDir, `${n}.png`), fullPage: true })
}
await ctx.close()
server.close()
