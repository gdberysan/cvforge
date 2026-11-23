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
import { cvOutline } from './outline'

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
export async function renderDocx(content: CVContent, opts: DocxOpts): Promise<Uint8Array> {
  const outline = cvOutline(content, opts.language)

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
      children: [new TextRun({ text: clean(outline.name), bold: true, color: INK, size: 40 })],
    }),
    ...(outline.title
      ? [
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: clean(outline.title), color: MUTED, size: 23 })],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: clean(outline.contact), color: MUTED, size: 19 })],
    }),
  ]

  for (const section of outline.sections) {
    children.push(heading(section.heading))
    for (const it of section.items) {
      if (it.kind === 'para') children.push(body(it.text))
      else if (it.kind === 'skills') children.push(body(`${it.category}: ${it.items.join(', ')}`))
      else {
        children.push(roleLine(it.left, it.right))
        for (const bullet of it.bullets) children.push(body(bullet, { bullet: true }))
      }
    }
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

  // Bytes, not a Node Buffer: toBuffer is Node-only, and the browser edition
  // renders the same file in its Worker.
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}
