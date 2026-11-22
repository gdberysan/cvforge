import { readFile } from 'node:fs/promises'
import { phone } from './phone.mjs'

const [dbCopy, configFile] = process.argv.slice(2)
const key = JSON.parse(await readFile(configFile, 'utf8')).anthropicApiKey
const { browser, page } = await phone()
await page.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const bytes = Array.from(await readFile(dbCopy))
console.log(
  'import :',
  JSON.stringify(
    await page.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes),
  ),
)
console.log(
  'key    :',
  JSON.stringify(
    await page.evaluate(
      (k) => window.cvforgeDebug.action('settings', 'saveApiKeyAction', [k]),
      key,
    ),
  ),
)
await page.goto('http://localhost:4100/')
await page.waitForTimeout(3000)
console.log('screen :', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 220))
await browser.close()
