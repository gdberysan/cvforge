import { describe, expect, it } from 'vitest'
import { renderPlaintext } from '@/lib/render/plaintext'
import type { CVContent } from '@/lib/schemas'

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
  ],
  education: [{ degree: 'BA International Business', institution: 'UNAM', period: '2010 – 2014' }],
  skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
  extras: [],
}

describe('renderPlaintext', () => {
  it('lays the whole CV out as plain text a form textarea will accept', () => {
    const text = renderPlaintext(content, { language: 'en' })
    expect(text).toContain('Dana Sofía Pérez Ruiz')
    expect(text).toContain('EXPERIENCE')
    expect(text).toContain('Engineer — Tiendamax')
    expect(text).toContain('- Cut checkout abandonment 18%')
    expect(text).toContain('Languages: TypeScript, Python')
    expect(text).not.toMatch(/<[a-z]/i)
  })

  it('speaks es-MX when the document does', () => {
    const open: CVContent = {
      ...content,
      experience: [{ ...content.experience[0], endDate: undefined }],
    }
    const text = renderPlaintext(open, { language: 'es-MX' })
    expect(text).toContain('EXPERIENCIA')
    expect(text).toContain('actualidad')
  })

  it('prints dates the way the preview does', () => {
    const text = renderPlaintext(content, { language: 'en' })
    expect(text).toContain('Jan 2016 – Jun 2018')
    expect(text).not.toContain('2016-01')
  })
})
