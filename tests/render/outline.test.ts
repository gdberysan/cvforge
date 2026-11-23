import { describe, expect, it } from 'vitest'
import { renderCvHtml } from '@/lib/render/cv-html'
import { cvOutline } from '@/lib/render/outline'
import { renderPlaintext } from '@/lib/render/plaintext'
import type { CVContent } from '@/lib/schemas'

const cv: CVContent = {
  header: { fullName: 'Dana Pérez', title: '', contactLines: ['CDMX', ' ', 'd@p.com'] },
  summary: '  ',
  summaryCitedEvidenceIds: [],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Growth Lead',
      company: 'Tiendamax',
      startDate: '2020-01',
      bullets: [{ id: 'b1', text: 'Grew sales', citedEvidenceIds: [], keywordsUsed: [] }],
    },
  ],
  projects: [],
  education: [{ degree: 'Licenciatura', institution: 'UNAM', period: '' }],
  skills: [
    { category: 'Ads', items: ['Google Ads', ' '] },
    { category: 'Empty', items: [] },
  ],
  extras: [{ heading: 'Idiomas', lines: [] }],
}

describe('cvOutline — what every renderer prints', () => {
  it('drops empty sections, groups and lines, and never prints an empty date', () => {
    const outline = cvOutline(cv, 'es-MX')
    expect(outline.sections.map((s) => s.heading)).toEqual([
      'Experiencia',
      'Educación',
      'Habilidades',
    ])
    expect(outline.contact).toBe('CDMX · d@p.com')
    expect(outline.title).toBe('')
  })

  it('writes an education period like the jobs’ dates, whatever form it was stored in', () => {
    const dated = {
      ...cv,
      education: [{ degree: 'Licenciatura', institution: 'UNAM', period: '2011-08 – 2016-01' }],
    }
    const right = (language: 'es-MX' | 'en') =>
      cvOutline(dated, language).sections.find(
        (x) => x.heading === (language === 'es-MX' ? 'Educación' : 'Education'),
      )?.items[0]
    const es = right('es-MX')
    const en = right('en')
    expect(es && 'right' in es ? es.right : '').not.toMatch(/\d{4}-\d{2}/)
    expect(en && 'right' in en ? en.right : '').not.toMatch(/\d{4}-\d{2}/)
    // Free text without stored dates passes through untouched.
    const plain = {
      ...cv,
      education: [{ degree: 'MBA', institution: 'IPADE', period: 'En curso' }],
    }
    const item = cvOutline(plain, 'es-MX').sections.find((x) => x.heading === 'Educación')?.items[0]
    expect(item && 'right' in item ? item.right : '').toBe('En curso')
  })

  it('keeps the clipboard text and the HTML in agreement', () => {
    const text = renderPlaintext(cv, { language: 'es-MX' })
    expect(text).toContain('Licenciatura — UNAM\n')
    expect(text).not.toContain('()')
    expect(text).not.toContain('IDIOMAS')
    const html = renderCvHtml(cv, { language: 'es-MX' })
    expect(html).not.toContain('Idiomas')
    expect(html).not.toContain('class="title"')
    expect(html).not.toContain('Empty')
  })
})
