/**
 * Renders the app icons from app/icon.svg with the browser the release
 * already uses. Run once when the icon changes; the PNGs are committed.
 *   npx tsx scripts/render-icons.ts
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

/** The dark --surface-base (styles/korven/colors.css), the icon's own background. */
const BACKGROUND = '#0E131B'

const svg = readFileSync('app/icon.svg', 'utf8')
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage()
for (const [file, size, padding] of [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  // Maskable: Android crops to a circle; the safe zone is the central 80%.
  ['public/icons/maskable-512.png', 512, 0.1],
] as const) {
  const inner = Math.round(size * (1 - 2 * padding))
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${BACKGROUND}">
       <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div>
     </body></html>`,
  )
  await page.screenshot({ path: file })
}
await browser.close()
