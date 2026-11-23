import { chromium, devices } from 'playwright'

const [file, out] = process.argv.slice(2)
const b = await chromium.launch()
const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage()
await p.goto(`file://${file}`)
await p.waitForTimeout(1500)
await p.screenshot({ path: out, fullPage: false })
await b.close()
