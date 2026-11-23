import { readFile } from 'node:fs/promises'
import { chromium, devices } from 'playwright'

const [profileDir, dbCopy] = process.argv.slice(2)
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
const p = await ctx.newPage()
const base = 'http://127.0.0.1:4100'
await p.goto(`${base}/`)
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const bytes = Array.from(await readFile(dbCopy))
console.log(
  'import :',
  JSON.stringify(
    await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes),
  ).slice(0, 60),
)
await p.evaluate(() => window.cvforgeDebug.setApiKey?.('sk-ant-test-not-a-real-key'))
const opfs = () =>
  p.evaluate(async () => {
    const r = await navigator.storage.getDirectory()
    const n = []
    for await (const k of r.keys()) n.push(k)
    return n
  })
await p.goto(`${base}/settings/`)
await p.waitForTimeout(2500)
console.log('before :', (await opfs()).join(', '))
console.log('version:', (await p.locator('.build-info').innerText()).replace(/\s+/g, ' '))
await p.getByRole('button', { name: 'Borrar todo…' }).click()
await p.getByRole('button', { name: 'Sí, borrar todo' }).click()
await p.waitForURL(`${base}/`, { timeout: 20000 })
await p.waitForTimeout(3000)
console.log('after  :', (await opfs()).join(', ') || '(only what a fresh start creates)')
console.log('screen :', (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 80))
console.log(
  'status :',
  JSON.stringify(await p.evaluate(() => window.cvforgeDebug.status())).slice(0, 120),
)
await ctx.close()
