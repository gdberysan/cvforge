import fs from 'node:fs'
import { PDFParse } from 'pdf-parse'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { isSnug, renderCvHtml } from '@/lib/render/cv-html'
import { isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'
import type { CVContent } from '@/lib/schemas'

/**
 * On a phone the CV prints on the phone's paper, whatever the template asks:
 * Android in Mexico defaults to Letter (Carta). On 2026-11-24 a CV that fit
 * one A4 page printed on an S25 with its last section alone on page 2.
 */
const seed = JSON.parse(fs.readFileSync('demo/seed.json', 'utf8'))

/** The demo CV with its last `n` bullets dropped: a CV just over one A4 page. */
function trimmed(n: number, app = 0): CVContent {
  const cv = structuredClone(seed.applications[app].documents.cv) as CVContent
  for (let k = 0; k < n; k++) {
    const role = [...cv.experience, ...(cv.projects ?? [])]
      .reverse()
      .find((r) => r.bullets.length > 0)
    role?.bullets.pop()
  }
  return cv
}

/** Null where no browser can be launched (a CI job without Playwright's). */
async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

async function pages(cv: CVContent, format: 'A4' | 'Letter'): Promise<number> {
  const browser = await launch()
  if (!browser) throw new Error('no browser')
  try {
    const page = await browser.newPage()
    await page.setContent(renderCvHtml(cv, { language: 'es-MX' }), { waitUntil: 'load' })
    // preferCSSPageSize off: the paper is the device's choice, as on Android.
    const pdf = await page.pdf({ format, preferCSSPageSize: false, printBackground: true })
    const parsed = await new PDFParse({ data: new Uint8Array(pdf) }).getInfo()
    return parsed.total
  } finally {
    await browser.close()
  }
}

describe('the CV on a phone’s paper', () => {
  it('fits Letter at least as well as A4, so one A4 page never spills on Carta', async () => {
    const probe = (await isPdfEngineAvailable()) ? await launch() : null
    if (!probe) {
      console.warn('Chromium not installed; skipping. Run: npx playwright install chromium')
      return
    }
    await probe.close()
    for (const n of [7, 8]) {
      expect(await pages(trimmed(n), 'Letter')).toBeLessThanOrEqual(await pages(trimmed(n), 'A4'))
    }
    // A CV a little over one A4 page now fits one Letter page.
    expect(await pages(trimmed(7), 'Letter')).toBe(1)
  }, 120_000)

  // 2026-11-24, on an S25: a CV of 1.07 A4 pages printed its last section
  // alone on page 2. A CV a little over a whole page is now set snug.
  it('sets a CV a little over one page snug, and it prints on one page', async () => {
    const probe = (await isPdfEngineAvailable()) ? await launch() : null
    if (!probe) {
      console.warn('Chromium not installed; skipping. Run: npx playwright install chromium')
      return
    }
    await probe.close()
    for (const [n, app] of [
      [6, 0],
      [7, 0],
      [7, 1],
      [8, 1],
      [9, 1],
    ] as const) {
      const cv = trimmed(n, app)
      expect(isSnug(cv)).toBe(true)
      const desktop = await new PDFParse({
        data: new Uint8Array(await renderPdf(renderCvHtml(cv, { language: 'es-MX' }))),
      }).getInfo()
      expect(desktop.total).toBe(1)
      expect(await pages(cv, 'Letter')).toBe(1)
    }
    // A CV well into its second page is left as it is.
    expect(isSnug(trimmed(3, 0))).toBe(false)
  }, 180_000)
})
