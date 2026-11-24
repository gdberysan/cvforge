import type { CVContent } from '@/lib/schemas'
import {
  educationLine,
  formatDate,
  formatDateOf,
  projectDates,
  projectTitle,
  type RenderLanguage,
} from './format'

export const HEADINGS = {
  en: {
    summary: 'Summary',
    experience: 'Experience',
    projects: 'Projects',
    education: 'Education',
    skills: 'Skills',
    present: 'Present',
  },
  'es-MX': {
    summary: 'Resumen',
    experience: 'Experiencia',
    projects: 'Proyectos',
    education: 'Educación',
    skills: 'Habilidades',
    present: 'actualidad',
  },
} as const

/**
 * One printed item: a dated entry (a role, a project, a degree) with its
 * bullets, a paragraph, or a skills row.
 */
export type OutlineItem =
  | { kind: 'entry'; left: string; right: string; bullets: string[] }
  | { kind: 'para'; text: string }
  | { kind: 'skills'; category: string; items: string[] }

export type Outline = {
  name: string
  /** '' when there is none: no renderer prints an empty line for it. */
  title: string
  contact: string
  sections: { heading: string; items: OutlineItem[] }[]
}

/**
 * What a CV prints, in order — decided once. The PDF/preview, the DOCX, the
 * clipboard text and the page estimate all walk this, so they cannot
 * disagree about which sections exist, what a dated line says, or what an
 * empty field does. Each used to decide for itself: an undated degree
 * printed "()" in the clipboard text while the others printed nothing.
 */
export function cvOutline(content: CVContent, language: RenderLanguage): Outline {
  const h = HEADINGS[language]
  const span = (
    start: string,
    end: string | undefined,
    flags: { startYearOnly?: boolean; endYearOnly?: boolean },
  ) =>
    `${formatDateOf(start, language, flags.startYearOnly)} – ${end ? formatDateOf(end, language, flags.endYearOnly) : h.present}`
  const text = (s: string) => s.trim()

  const sections: Outline['sections'] = [
    {
      heading: h.summary,
      items: text(content.summary) ? [{ kind: 'para', text: text(content.summary) }] : [],
    },
    {
      heading: h.experience,
      items: content.experience.map((role) => ({
        kind: 'entry',
        left: `${role.title} — ${role.company}`,
        right: span(role.startDate, role.endDate, role),
        bullets: role.bullets.map((b) => b.text),
      })),
    },
    {
      heading: h.projects,
      items: (content.projects ?? []).map((project) => ({
        kind: 'entry',
        left: projectTitle(project),
        right: projectDates(project, language, h.present),
        bullets: project.bullets.map((b) => b.text),
      })),
    },
    {
      heading: h.education,
      items: content.education
        .filter((ed) => educationLine(ed))
        .map((ed) => ({
          kind: 'entry',
          left: educationLine(ed),
          // Free text, often built from stored dates ("2011-08 – 2016-01"):
          // any year-month in it is written like the jobs' ("ago 2011").
          right: text(ed.period).replace(/\b\d{4}-\d{2}\b/g, (d) => formatDate(d, language)),
          bullets: [],
        })),
    },
    {
      heading: h.skills,
      items: content.skills
        .map((g) => ({ ...g, items: g.items.map(text).filter(Boolean) }))
        .filter((g) => g.items.length > 0)
        .map((g) => ({ kind: 'skills', category: g.category, items: g.items })),
    },
    ...content.extras.map((extra) => ({
      heading: extra.heading,
      items: extra.lines
        .map(text)
        .filter(Boolean)
        .map((line): OutlineItem => ({ kind: 'para', text: line })),
    })),
  ]

  return {
    name: content.header.fullName,
    title: text(content.header.title),
    contact: content.header.contactLines.map(text).filter(Boolean).join(' · '),
    sections: sections.filter((s) => s.items.length > 0),
  }
}
