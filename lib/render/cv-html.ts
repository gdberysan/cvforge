import type { CVContent } from '@/lib/schemas'
import { educationLine, formatDate } from './format'

type RenderOpts = {
  language: 'en' | 'es-MX'
  /** Optional single hairline under section headings. Off by default; never on text. */
  accentRule?: boolean
}

export const HEADINGS = {
  en: {
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    present: 'Present',
  },
  'es-MX': {
    summary: 'Resumen',
    experience: 'Experiencia',
    education: 'Educación',
    skills: 'Habilidades',
    present: 'actualidad',
  },
} as const

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function documentCss(opts: RenderOpts): string {
  return `
    :root {
      --doc-ink: #14181d;
      --doc-muted: #4a5159;
      --doc-rule: #c9cdd2;
      --doc-paper: #ffffff;
      --doc-accent: #b8641f;
    }
    @page { size: A4; margin: 16mm 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--doc-paper);
      color: var(--doc-ink);
      font-family: Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
    }
    .doc { max-width: 180mm; margin: 0 auto; }
    .name { font-size: 20pt; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
    .title { font-size: 11.5pt; color: var(--doc-muted); margin: 2mm 0 0; }
    .contact { font-size: 9.5pt; color: var(--doc-muted); margin: 3mm 0 0; }
    h2 {
      font-size: 11pt; font-weight: 700; color: var(--doc-ink);
      text-transform: uppercase; letter-spacing: 0.06em;
      margin: 7mm 0 2.5mm; padding-bottom: 1mm;
      border-bottom: 0.6pt solid ${opts.accentRule ? 'var(--doc-accent)' : 'var(--doc-rule)'};
    }
    .role { page-break-inside: avoid; break-inside: avoid; margin-bottom: 4.5mm; }
    .role-head { display: flex; justify-content: space-between; gap: 6mm; align-items: baseline; }
    .role-title { font-weight: 700; }
    .role-dates { font-size: 9.5pt; color: var(--doc-muted); white-space: nowrap; }
    ul { margin: 1.5mm 0 0; padding-left: 4.5mm; }
    li { margin-bottom: 1mm; }
    .skills-row { margin-bottom: 1.5mm; }
    .skills-cat { font-weight: 700; }
  `
}

/**
 * One HTML template is both the on-screen preview and the print source, so
 * they cannot drift. Deliberately NOT Korven-branded (spec §10.2): this
 * surface is printed on paper and read by a recruiter who did not ask for a
 * brand experience. Single column, no tables or images, conventional
 * headings, contact in the body — the ATS constraints that genuinely help.
 */
export function renderCvHtml(content: CVContent, opts: RenderOpts): string {
  const h = HEADINGS[opts.language]
  const e = escapeHtml

  const experience = content.experience
    .map((role) => {
      const end = role.endDate ? formatDate(role.endDate, opts.language) : h.present
      return `
        <div class="role" style="page-break-inside: avoid;">
          <div class="role-head">
            <span class="role-title">${e(role.title)} — ${e(role.company)}</span>
            <span class="role-dates">${e(formatDate(role.startDate, opts.language))} – ${e(end)}</span>
          </div>
          <ul>${role.bullets.map((b) => `<li>${e(b.text)}</li>`).join('')}</ul>
        </div>`
    })
    .join('')

  const education = content.education
    .map(
      (ed) =>
        `<div class="role"><div class="role-head"><span class="role-title">${e(educationLine(ed))}</span><span class="role-dates">${e(ed.period)}</span></div></div>`,
    )
    .join('')

  const skills = content.skills
    .map(
      (s) =>
        `<div class="skills-row"><span class="skills-cat">${e(s.category)}:</span> ${e(s.items.join(', '))}</div>`,
    )
    .join('')

  const extras = content.extras
    .map((x) => `<h2>${e(x.heading)}</h2>${x.lines.map((l) => `<p>${e(l)}</p>`).join('')}`)
    .join('')

  return `<!doctype html>
<html lang="${opts.language === 'es-MX' ? 'es-MX' : 'en'}">
<head><meta charset="utf-8"><title>${e(content.header.fullName)}</title><style>${documentCss(opts)}</style></head>
<body>
  <div class="doc">
    <p class="name">${e(content.header.fullName)}</p>
    <p class="title">${e(content.header.title)}</p>
    <p class="contact">${content.header.contactLines.map(e).join(' · ')}</p>

    ${content.summary ? `<h2>${h.summary}</h2><p>${e(content.summary)}</p>` : ''}
    ${experience ? `<h2>${h.experience}</h2>${experience}` : ''}
    ${education ? `<h2>${h.education}</h2>${education}` : ''}
    ${skills ? `<h2>${h.skills}</h2>${skills}` : ''}
    ${extras}
  </div>
</body>
</html>`
}
