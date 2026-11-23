import type { CVContent } from '@/lib/schemas'
import { cvOutline } from './outline'

/**
 * Half of application forms are a textarea. Same content, same order, no
 * markup — headings uppercased, bullets dashed, one blank line per section.
 */
export function renderPlaintext(content: CVContent, opts: { language: 'en' | 'es-MX' }): string {
  const outline = cvOutline(content, opts.language)
  const lines: string[] = [outline.name, ...(outline.title ? [outline.title] : []), outline.contact]

  for (const section of outline.sections) {
    lines.push('', section.heading.toUpperCase(), '')
    for (const it of section.items) {
      if (it.kind === 'para') lines.push(it.text)
      else if (it.kind === 'skills') lines.push(`${it.category}: ${it.items.join(', ')}`)
      else {
        lines.push(it.right ? `${it.left}  (${it.right})` : it.left)
        for (const bullet of it.bullets) lines.push(`- ${bullet}`)
        if (it.bullets.length > 0) lines.push('')
      }
    }
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}
