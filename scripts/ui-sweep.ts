/**
 * Layout sweep (redesign spec 2026-10-15). Run against a server started on
 * the DEMO database, never the real one:
 *
 *   CVFORGE_MODE=demo npm run dev -- -p 3100   # other terminal
 *   npm run ui:sweep -- http://localhost:3100
 *
 * Fails (exit 1) on horizontal overflow, phone tap targets under 44×44 or
 * text under 12px. Prints height and visible words per page for the record.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { probe } from './ui-sweep-probe'

const base = process.argv[2] ?? 'http://localhost:3100'
const WIDTHS = [360, 390, 768, 1440]
const THEMES = ['dark', 'light'] as const

async function main() {
  const browser = await chromium.launch()
  const home = await (await browser.newPage()).goto(`${base}/pipeline`)
  if (!home?.ok()) throw new Error(`ui-sweep: ${base} is not serving`)
  const listPage = await browser.newPage()
  await listPage.goto(`${base}/pipeline`)
  const appHref = await listPage.locator('a[href^="/application/"]').first().getAttribute('href')
  const appId = appHref?.split('/')[2]?.split('?')[0]
  // The Documents step needs an application with a composed CV; the demo's
  // first one has it. SWEEP_DOCS_ID points elsewhere when it does not.
  const docsId = process.env.SWEEP_DOCS_ID ?? appId
  const PAGES = [
    '/',
    `/application/${appId}?step=decide`,
    `/application/${docsId}?step=docs`,
    '/pipeline',
    '/evidence',
    '/stats',
    '/settings',
    '/muestrario',
  ]
  mkdirSync('ui-sweep', { recursive: true })
  let failed = false
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 830 },
        hasTouch: width < 600,
        isMobile: width < 600,
      })
      await ctx.addCookies([{ name: 'cvforge_theme', value: theme, url: base }])
      // tsx (esbuild) wraps named functions in __name(); the probe's source is
      // shipped to the page as text, so the page needs that helper too.
      await ctx.addInitScript('globalThis.__name = (f) => f')
      const page = await ctx.newPage()
      for (const p of PAGES) {
        await page.goto(`${base}${p}`, { waitUntil: 'networkidle' })
        const r = (await page.evaluate(
          `(${probe.toString()})(document, window, ${width < 600})`,
        )) as ReturnType<typeof probe>
        const bad = r.overflowX > 0 || r.smallTargets.length > 0 || r.tinyText.length > 0
        if (bad) failed = true
        console.log(
          `${bad ? 'FAIL' : 'ok  '} ${theme} ${width} ${p}  height=${r.height} words=${r.words}${r.overflowX > 0 ? ` overflowX=${r.overflowX}` : ''}`,
        )
        for (const s of r.smallTargets.slice(0, 8)) console.log(`       small target: ${s}`)
        for (const s of r.tinyText.slice(0, 8)) console.log(`       tiny text: ${s}`)
        await page.screenshot({
          path: `ui-sweep/${theme}-${width}-${p.replace(/[/?=]/g, '_') || 'home'}.png`,
          fullPage: true,
        })
      }
      await ctx.close()
    }
  }
  await browser.close()
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
