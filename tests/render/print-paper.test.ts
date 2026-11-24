import fs from 'node:fs'
import { PDFParse } from 'pdf-parse'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { renderCvHtml } from '@/lib/render/cv-html'
import { isPdfEngineAvailable } from '@/lib/render/pdf'
import type { CVContent } from '@/lib/schemas'

/**
 * On a phone the CV prints on the phone's paper, whatever the template asks:
 * Android in Mexico defaults to Letter (Carta). On 2026-11-24 a CV that fit
 * one A4 page printed on an S25 with its last section alone on page 2.
 */
const seed = JSON.parse(fs.readFileSync('demo/seed.json', 'utf8'))

/** The demo CV with its last `n` bullets dropped: a CV just over one A4 page. */
function trimmed(n: number): CVContent {
  const cv = structuredClone(seed.applications[0].documents.cv) as CVContent
  for (let k = 0; k < n; k++) {
    const role = [...cv.experience, ...(cv.projects ?? [])]
      .reverse()
      .find((r) => r.bullets.length > 0)
    role?.bullets.pop()
  }
  return cv
}

async function pages(cv: CVContent, format: 'A4' | 'Letter'): Promise<number> {
  const browser = await chromium.launch()
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
    if (!(await isPdfEngineAvailable())) {
      console.warn('Chromium not installed; skipping. Run: npx playwright install chromium')
      return
    }
    for (const n of [7, 8]) {
      expect(await pages(trimmed(n), 'Letter')).toBeLessThanOrEqual(await pages(trimmed(n), 'A4'))
    }
    // A CV a little over one A4 page now fits one Letter page.
    expect(await pages(trimmed(7), 'Letter')).toBe(1)
  }, 120_000)
})
