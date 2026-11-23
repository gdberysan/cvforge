import { chromium, devices } from 'playwright'

const [url] = process.argv.slice(2)
const b = await chromium.launch()
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage()
await p.goto(url, { waitUntil: 'networkidle' })
console.log(
  await p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out = [`viewport ${vw} doc ${document.documentElement.scrollWidth}`]
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 && r.width > 0) {
        const parentOver =
          el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1
        if (!parentOver)
          out.push(
            `${el.tagName}.${el.className} right=${Math.round(r.right)} w=${Math.round(r.width)}`,
          )
      }
    }
    return out.slice(0, 15).join('\n')
  }),
)
await b.close()
