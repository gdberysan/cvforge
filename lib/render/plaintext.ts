import type { CVContent } from '@/lib/schemas'
import { HEADINGS } from './cv-html'
import { educationLine, formatDate } from './format'

/**
 * Half of application forms are a textarea. Same content, same order, no
 * markup — headings uppercased, bullets dashed, one blank line per section.
 */
export function renderPlaintext(content: CVContent, opts: { language: 'en' | 'es-MX' }): string {
  const h = HEADINGS[opts.language]
  const lines: string[] = [
    content.header.fullName,
    content.header.title,
    content.header.contactLines.join(' · '),
  ]

  const section = (title: string) => {
    lines.push('', title.toUpperCase(), '')
  }

  if (content.summary) {
    section(h.summary)
    lines.push(content.summary)
  }

  if (content.experience.length > 0) {
    section(h.experience)
    for (const role of content.experience) {
      lines.push(
        `${role.title} — ${role.company}  (${formatDate(role.startDate, opts.language)} – ${role.endDate ? formatDate(role.endDate, opts.language) : h.present})`,
      )
      for (const bullet of role.bullets) lines.push(`- ${bullet.text}`)
      lines.push('')
    }
  }

  if (content.education.length > 0) {
    section(h.education)
    for (const ed of content.education) {
      lines.push(`${educationLine(ed)}  (${ed.period})`)
    }
  }

  if (content.skills.length > 0) {
    section(h.skills)
    for (const group of content.skills) {
      lines.push(`${group.category}: ${group.items.join(', ')}`)
    }
  }

  for (const extra of content.extras) {
    section(extra.heading)
    lines.push(...extra.lines)
  }

  return `${lines.join('\n').trim()}\n`
}
