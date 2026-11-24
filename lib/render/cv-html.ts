import type { CVContent } from '@/lib/schemas'
import { cvOutline, type OutlineItem } from './outline'

type RenderOpts = {
  language: 'en' | 'es-MX'
  /** Optional single hairline under section headings. Off by default; never on text. */
  accentRule?: boolean
}

export { HEADINGS } from './outline'

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
    /* A phone prints on its own paper, not the size asked for here: Android
       in Mexico or the US defaults to Letter (Carta), 17.6 mm shorter than
       A4, so a CV that fills one A4 page spilled a lone section onto a
       second. On a Letter sheet the margins and leading give back more than
       that, so one A4 page stays one page. The window is the whole sheet's
       height as a print dialog reports it: A4 (297 mm) stays out, and so
       does the desktop renderer, which reports the area inside its own
       margins (265 mm). */
    @media print and (min-height: 270mm) and (max-height: 285mm) {
      @page { margin: 11mm 15mm; }
      body { line-height: 1.36; }
    }
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
  const e = escapeHtml
  const outline = cvOutline(content, opts.language)

  const item = (it: OutlineItem): string => {
    if (it.kind === 'para') return `<p>${e(it.text)}</p>`
    if (it.kind === 'skills')
      return `<div class="skills-row"><span class="skills-cat">${e(it.category)}:</span> ${e(it.items.join(', '))}</div>`
    // A role never breaks across pages: half a role on each page reads as two.
    return `
        <div class="role" style="page-break-inside: avoid;">
          <div class="role-head">
            <span class="role-title">${e(it.left)}</span>
            ${it.right ? `<span class="role-dates">${e(it.right)}</span>` : ''}
          </div>
          ${it.bullets.length > 0 ? `<ul>${it.bullets.map((b) => `<li>${e(b)}</li>`).join('')}</ul>` : ''}
        </div>`
  }

  return `<!doctype html>
<html lang="${opts.language === 'es-MX' ? 'es-MX' : 'en'}">
<head><meta charset="utf-8"><title>${e(outline.name)}</title><style>${documentCss(opts)}</style></head>
<body>
  <div class="doc">
    <p class="name">${e(outline.name)}</p>
    ${outline.title ? `<p class="title">${e(outline.title)}</p>` : ''}
    <p class="contact">${e(outline.contact)}</p>
    ${outline.sections.map((s) => `<h2>${e(s.heading)}</h2>${s.items.map(item).join('')}`).join('\n    ')}
  </div>
</body>
</html>`
}
