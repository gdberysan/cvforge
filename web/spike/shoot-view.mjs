import { chromium, devices } from 'playwright'

const [base, out, ...paths] = process.argv.slice(2)
const b = await chromium.launch()
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage()
for (const path of paths) {
  await p.goto(base + path, { waitUntil: 'networkidle' })
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await p.waitForTimeout(600)
  await p.screenshot({ path: `${out}/${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}.png` })
}
await b.close()
