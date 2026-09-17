import { describe, expect, it } from 'vitest'
import { renderCvHtml } from '@/lib/render/cv-html'
import type { CVContent } from '@/lib/schemas'
import { CVRoleSchema } from '@/lib/schemas'

const content: CVContent = {
  header: {
    fullName: 'Dana Sofía Pérez Ruiz',
    title: 'Full-stack Engineer',
    contactLines: ['g@b.com', 'Ciudad de México'],
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
    {
      experienceId: 'exp_2',
      title: 'Lead',
      company: 'Northwind',
      startDate: '2021-01',
      bullets: [
        {
          id: 'b2',
          text: 'Led the payments integration',
          citedEvidenceIds: ['ev_2'],
          keywordsUsed: [],
        },
      ],
    },
  ],
  education: [{ degree: 'BA International Business', institution: 'UNAM', period: '2010 – 2014' }],
  skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
  extras: [],
}

describe('renderCvHtml', () => {
  it('uses conventional English section headings that parsers recognise', () => {
    const html = renderCvHtml(content, { language: 'en' })
    expect(html).toContain('>Summary<')
    expect(html).toContain('>Experience<')
    expect(html).toContain('>Education<')
    expect(html).toContain('>Skills<')
  })

  it('uses conventional Spanish headings for es-MX', () => {
    const html = renderCvHtml(content, { language: 'es-MX' })
    expect(html).toContain('>Resumen<')
    expect(html).toContain('>Experiencia<')
    expect(html).toContain('>Educación<')
    expect(html).toContain('>Habilidades<')
  })

  it('renders a current role as "Present" in English and "actualidad" in es-MX', () => {
    expect(renderCvHtml(content, { language: 'en' })).toContain('Present')
    expect(renderCvHtml(content, { language: 'es-MX' })).toContain('actualidad')
  })

  it('puts contact details in the body, never in a header element', () => {
    const html = renderCvHtml(content, { language: 'en' })
    expect(html).toContain('g@b.com')
    expect(html).not.toMatch(/<header[^>]*class="[^"]*page-header/)
  })

  it('contains no Korven brand colours — documents are not brand surfaces', () => {
    const html = renderCvHtml(content, { language: 'en' })
    expect(html.toLowerCase()).not.toContain('#ff8a2b')
    expect(html.toLowerCase()).not.toContain('#0e131b')
    expect(html).not.toContain('--surface-base')
  })

  it('emits no tables, images, or multi-column layout', () => {
    const html = renderCvHtml(content, { language: 'en' })
    expect(html).not.toMatch(/<table|<img|column-count/i)
  })

  it('sets page-break-inside: avoid on role blocks so a role never splits across pages', () => {
    const html = renderCvHtml(content, { language: 'en' })
    expect(html).toContain('page-break-inside: avoid')
  })

  it('escapes HTML in model output rather than injecting it', () => {
    const risky: CVContent = { ...content, summary: 'Built <script>alert(1)</script> systems' }
    const html = renderCvHtml(risky, { language: 'en' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('malformed dates', () => {
  it('never prints the word undefined — a date the formatter cannot read renders raw', () => {
    const odd: CVContent = {
      ...content,
      experience: [{ ...content.experience[0], startDate: '2016', endDate: undefined }],
    }
    const html = renderCvHtml(odd, { language: 'en' })
    expect(html).not.toContain('undefined')
    expect(html).toContain('2016')
  })

  it('escapes whatever the date field carries, like every other field', () => {
    const hostile: CVContent = {
      ...content,
      experience: [{ ...content.experience[0], startDate: '<img src=x>', endDate: undefined }],
    }
    expect(renderCvHtml(hostile, { language: 'en' })).not.toContain('<img')
  })
})

describe('CVRoleSchema dates', () => {
  it('rejects a model-emitted date that is not YYYY-MM, routing it to repair', () => {
    expect(CVRoleSchema.safeParse({ ...content.experience[0], startDate: '2016' }).success).toBe(
      false,
    )
    expect(CVRoleSchema.safeParse(content.experience[0]).success).toBe(true)
  })
})
describe('education with a missing half', () => {
  it('renders just the institution, with no dangling separator', () => {
    const partial = {
      ...content,
      education: [{ degree: '', institution: 'UNAM', period: '2010 – 2014' }],
    }
    const html = renderCvHtml(partial, { language: 'en' })
    expect(html).toContain('UNAM')
    expect(html).not.toContain('— UNAM')
  })
})
