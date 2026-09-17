import { PDFParse } from 'pdf-parse'
import { describe, expect, it } from 'vitest'
import { renderCvHtml } from '@/lib/render/cv-html'
import { buildFilename, isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'
import type { CVContent } from '@/lib/schemas'

const content: CVContent = {
  header: {
    fullName: 'Dana Sofía Pérez Ruiz',
    title: 'Full-stack Engineer',
    contactLines: ['g@b.com'],
  },
  summary: 'Twelve years building ecommerce systems.',
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Engineer',
      company: 'Tiendamax',
      startDate: '2016-01',
      endDate: '2018-06',
      bullets: [
        {
          id: 'b1',
          text: 'Cut checkout abandonment 18%',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
      ],
    },
  ],
  education: [],
  skills: [],
  extras: [],
}

describe('buildFilename', () => {
  it('produces Firstname-Lastname-CV-Company.pdf', () => {
    expect(buildFilename('Dana Pérez', 'Acme Corp')).toBe('Dana-Perez-CV-Acme-Corp.pdf')
  })

  it('stays inside Latin-1, because Content-Disposition is a byte string', () => {
    // A header built with "Łukasz" or "Владимир" throws; the export 500s.
    for (const name of ['Łukasz Nowak', 'Владимир Петров', '田中 太郎']) {
      const file = buildFilename(name, 'Acme')
      expect(
        () => new Headers({ 'content-disposition': `attachment; filename="${file}"` }),
      ).not.toThrow()
      expect(file).toMatch(/CV-Acme\.pdf$/)
    }
    expect(buildFilename('Łukasz Nowak', 'Acme')).toBe('ukasz-Nowak-CV-Acme.pdf')
    expect(buildFilename('田中 太郎', 'Acme')).toBe('CV-Acme.pdf')
  })

  it('omits the company part when the company is blank', () => {
    expect(buildFilename('Dana Pérez', '')).toBe('Dana-Perez-CV.pdf')
  })

  it('strips accents and punctuation that break downloads', () => {
    expect(buildFilename('Dana Sofía Pérez Ruiz', 'Acme, Inc.')).toBe(
      'Dana-Sofia-Perez-Ruiz-CV-Acme-Inc.pdf',
    )
  })
})

describe('renderPdf', () => {
  it('produces a PDF whose text can be extracted back — the ATS-parseability gate', async () => {
    if (!(await isPdfEngineAvailable())) {
      console.warn('Chromium not installed; skipping. Run: npx playwright install chromium')
      return
    }

    const html = renderCvHtml(content, { language: 'en' })
    const buffer = await renderPdf(html)

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')

    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const parsed = await parser.getText()
    expect(parsed.text).toContain('Dana Sofía Pérez Ruiz')
    expect(parsed.text).toContain('Cut checkout abandonment 18%')
    expect(parsed.text).toContain('Tiendamax')
  }, 60_000)
})
