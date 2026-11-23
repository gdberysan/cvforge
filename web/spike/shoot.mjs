import { chromium, devices } from 'playwright'

const [base, out, ...paths] = process.argv.slice(2)
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['Pixel 7'] })
const p = await ctx.newPage()
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
for (const path of paths) {
  await p.goto(base + path, { waitUntil: 'networkidle' })
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await p.waitForTimeout(800)
  const name = path.replace(/[^a-z0-9]+/gi, '_') || 'home'
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  console.log(name, await p.evaluate(() => document.body.scrollHeight))
}
await b.close()
