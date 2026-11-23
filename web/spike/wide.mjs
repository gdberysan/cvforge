import { readFile } from 'node:fs/promises'
import { chromium, devices } from 'playwright'

const [db, path] = process.argv.slice(2)
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'es-MX' })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4100/')
await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const bytes = Array.from(await readFile(db))
await p.evaluate((x) => window.cvforgeDebug.importDatabase(new Uint8Array(x)), bytes)
await p.goto('http://127.0.0.1:4100' + path)
await p.waitForTimeout(2500)
console.log(
  await p.evaluate(() => {
    const W = document.documentElement.clientWidth
    const out = [`doc ${document.documentElement.scrollWidth} / ${W}`]
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.right > W + 1 && r.width > 0) {
        const par = el.parentElement?.getBoundingClientRect()
        if (!par || par.right <= W + 1)
          out.push(
            `${el.tagName}.${[...el.classList].join('.')} w=${Math.round(r.width)} right=${Math.round(r.right)} style=${el.getAttribute('style')?.slice(0, 80)}`,
          )
      }
    }
    const bx = document.querySelector('.pdf-html-box')
    if (bx) {
      const r = bx.getBoundingClientRect()
      out.push(`box x=${Math.round(r.x)} w=${Math.round(r.width)} cw=${bx.clientWidth}`)
      let e = bx
      while (e && e !== document.body) {
        const q = e.getBoundingClientRect()
        out.push(
          `  ${e.tagName}.${[...e.classList].join('.')} x=${Math.round(q.x)} w=${Math.round(q.width)}`,
        )
        e = e.parentElement
      }
    }
    return out.slice(0, 30).join('\n')
  }),
)
await b.close()
