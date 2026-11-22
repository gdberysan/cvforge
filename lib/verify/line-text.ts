import type { CVContent } from '@/lib/schemas'

/**
 * Every id a grounding flag can name on a CV → the text it names: each
 * bullet, the summary, the header title and each role title. A flag quotes the line it is
 * about, never an internal id like "b5" the reader cannot see anywhere.
 */
export function cvLineText(cv: CVContent | null | undefined): Record<string, string> {
  if (!cv) return {}
  return Object.fromEntries([
    ['summary', cv.summary],
    ['title', cv.header.title],
    ...cv.experience.map((r): [string, string] => [roleTitleId(r.experienceId), r.title]),
    ...cv.education.map((e, i): [string, string] => [
      educationLineId(i),
      [e.degree, e.institution].filter((s) => s.trim()).join(' — '),
    ]),
    ...[...cv.experience, ...cv.projects].flatMap((s) =>
      s.bullets.map((b): [string, string] => [b.id, b.text]),
    ),
  ])
}

/** The id a role's title is flagged under (a translated title is model-checked). */
export function roleTitleId(experienceId: string): string {
  return `role-${experienceId}-title`
}

/** The id a printed degree is flagged under (a degree worded unlike its record is model-checked). */
export function educationLineId(index: number): string {
  return `education-${index}`
}
