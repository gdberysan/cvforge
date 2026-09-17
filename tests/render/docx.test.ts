import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { renderDocx } from '@/lib/render/docx'
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

/** The spec's quality gate: the file unzips as a valid docx and the XML holds the content. */
function documentXml(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer))
  const doc = files['word/document.xml']
  expect(doc).toBeDefined()
  return strFromU8(doc)
}

describe('renderDocx', () => {
  it('produces a real zip container', async () => {
    const buffer = await renderDocx(content, { language: 'en' })
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
  })

  it('carries the content and conventional English headings in the document XML', async () => {
    const xml = documentXml(await renderDocx(content, { language: 'en' }))
    expect(xml).toContain('Dana Sofía Pérez Ruiz')
    expect(xml).toContain('EXPERIENCE')
    expect(xml).toContain('Cut checkout abandonment 18%')
    expect(xml).toContain('SKILLS')
  })

  it('uses Spanish headings and actualidad for es-MX', async () => {
    const open: CVContent = {
      ...content,
      experience: [{ ...content.experience[0], endDate: undefined }],
    }
    const xml = documentXml(await renderDocx(open, { language: 'es-MX' }))
    expect(xml).toContain('EXPERIENCIA')
    expect(xml).toContain('HABILIDADES')
    expect(xml).toContain('actualidad')
  })

  it('prints dates the way the preview does — the three targets once drifted', async () => {
    const xml = documentXml(await renderDocx(content, { language: 'en' }))
    expect(xml).toContain('Jan 2016 – Jun 2018')
    expect(xml).not.toContain('2016-01')
  })

  it('never prints a dangling dash for an education entry missing one half', async () => {
    const half: CVContent = {
      ...content,
      education: [{ degree: '', institution: 'UNAM', period: '2010 – 2014' }],
    }
    const xml = documentXml(await renderDocx(half, { language: 'en' }))
    expect(xml).toContain('UNAM')
    expect(xml).not.toContain('— UNAM')
  })

  it('strips control characters Word would refuse the file over', async () => {
    const dirty: CVContent = {
      ...content,
      experience: [
        {
          ...content.experience[0],
          bullets: [
            {
              id: 'b1',
              text: 'Cut\u0001 abandonment\u000B 18%',
              citedEvidenceIds: [],
              keywordsUsed: [],
            },
          ],
        },
      ],
    }
    const xml = documentXml(await renderDocx(dirty, { language: 'en' }))
    expect(xml).toContain('Cut abandonment 18%')
    const controls = [...xml].filter((ch) => ch.charCodeAt(0) < 0x20 && !'\t\n\r'.includes(ch))
    expect(controls).toEqual([])
  })

  it('declares Calibri, the DOCX-native safe face', async () => {
    const buffer = await renderDocx(content, { language: 'en' })
    const files = unzipSync(new Uint8Array(buffer))
    const everything = Object.keys(files)
      .map((k) => strFromU8(files[k]))
      .join('')
    expect(everything).toContain('Calibri')
  })
})
