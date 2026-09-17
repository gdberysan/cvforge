import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx'
import type { CVContent } from '@/lib/schemas'
import { HEADINGS } from './cv-html'
import { educationLine, formatDate } from './format'

type DocxOpts = { language: 'en' | 'es-MX' }

const INK = '14181D'
const MUTED = '4A5159'

/**
 * XML 1.0 forbids most C0 controls, and Word reports a file containing one
 * as unreadable. Content is model output and pasted evidence, so it is not
 * trusted to be clean. A newline inside a run renders as a space in Word;
 * making that explicit keeps it identical to the HTML template.
 */
function clean(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += ch
  }
  return out.replace(/\s*\n\s*/g, ' ')
}

/**
 * A data→data mapping from CVContent, not a second layout engine — some
 * portals accept nothing but .docx. Calibri because it is the face Word and
 * every parser expect; same single-column, conventional-headings discipline
 * as the HTML template.
 */
export async function renderDocx(content: CVContent, opts: DocxOpts): Promise<Buffer> {
  const h = HEADINGS[opts.language]

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9CDD2' } },
      children: [
        new TextRun({ text: clean(text).toUpperCase(), bold: true, color: INK, size: 22 }),
      ],
    })

  const body = (text: string, o: { bold?: boolean; muted?: boolean; bullet?: boolean } = {}) =>
    new Paragraph({
      ...(o.bullet ? { bullet: { level: 0 } } : {}),
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: clean(text),
          bold: o.bold ?? false,
          color: o.muted ? MUTED : INK,
          size: 21,
        }),
      ],
    })

  const roleLine = (left: string, right: string) =>
    new Paragraph({
      spacing: { before: 120, after: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: 10_000 }],
      children: [
        new TextRun({ text: clean(left), bold: true, color: INK, size: 21 }),
        new TextRun({ text: `\t${clean(right)}`, color: MUTED, size: 19 }),
      ],
    })

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: clean(content.header.fullName), bold: true, color: INK, size: 40 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: clean(content.header.title), color: MUTED, size: 23 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: clean(content.header.contactLines.join(' · ')),
          color: MUTED,
          size: 19,
        }),
      ],
    }),
  ]

  if (content.summary) {
    children.push(heading(h.summary), body(content.summary))
  }

  if (content.experience.length > 0) {
    children.push(heading(h.experience))
    for (const role of content.experience) {
      children.push(
        roleLine(
          `${role.title} — ${role.company}`,
          `${formatDate(role.startDate, opts.language)} – ${role.endDate ? formatDate(role.endDate, opts.language) : h.present}`,
        ),
      )
      for (const bullet of role.bullets) {
        children.push(body(bullet.text, { bullet: true }))
      }
    }
  }

  if (content.education.length > 0) {
    children.push(heading(h.education))
    for (const ed of content.education) {
      children.push(roleLine(educationLine(ed), ed.period))
    }
  }

  if (content.skills.length > 0) {
    children.push(heading(h.skills))
    for (const group of content.skills) {
      children.push(body(`${group.category}: ${group.items.join(', ')}`))
    }
  }

  for (const extra of content.extras) {
    children.push(heading(extra.heading))
    for (const line of extra.lines) children.push(body(line))
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 900, bottom: 900, left: 850, right: 850 } },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
