import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = browser.contexts()[0]
const owner = ctx.pages().find((x) => x.url() === 'http://localhost:4100/') ?? (await ctx.newPage())
await owner.goto('http://localhost:4100/')
await owner.waitForTimeout(3000)
console.log(
  'owner tab :',
  (await owner.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 60),
)
const shared = await ctx.newPage()
await shared.goto('http://localhost:4100/share/?shared=share_test_takeover')
await shared.waitForTimeout(5000)
const s = (await shared.locator('body').innerText()).replace(/\s+/g, ' ')
console.log(
  'share tab :',
  /another tab|otra pestaña/i.test(s) ? 'BUSY screen (not fixed)' : `opened: ${s.slice(0, 90)}`,
)
console.log(
  'owner now :',
  (await owner.locator('body').innerText())
    .replace(/\s+/g, ' ')
    .match(/moved to another tab|pasó a otra pestaña/i)?.[0] ?? 'still owner?',
)
await shared.close()
await browser.close()
