/**
 * The posting a person is looking at, read from the page they already have
 * open — never fetched. On LinkedIn, the job view's own parts; anywhere
 * else (or when LinkedIn's markup moves), the selection, then the page's
 * main text. Pure over a Document, so it is tested without a browser.
 */
export type PagePosting = {
  title: string
  company: string
  location: string
  text: string
  url: string
  source: 'linkedin' | 'selection' | 'page'
}

const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const first = (doc: Document, selectors: string[]): HTMLElement | null => {
  for (const s of selectors) {
    const el = doc.querySelector<HTMLElement>(s)
    if (el && clean(el.innerText ?? el.textContent).length > 0) return el
  }
  return null
}

const textOf = (el: HTMLElement | null) => clean(el?.innerText ?? el?.textContent)

/**
 * A description's text with its lists still reading as lists: innerText
 * drops the bullet, so each item's first line gets one back.
 */
function bodyOf(el: HTMLElement): string {
  const items = new Set(
    [...el.querySelectorAll('li')]
      .map((li) =>
        clean(li.innerText ?? li.textContent)
          .split('\n')[0]
          ?.trim(),
      )
      .filter(Boolean),
  )
  return textOf(el)
    .split('\n')
    .map((line) => {
      const l = line.trim()
      return items.has(l) ? `• ${l}` : l
    })
    .join('\n')
}

/** "…linkedin.com/jobs/view/123/?trk=…", "…/jobs/view/title-at-acme-123" or "?currentJobId=123" -> the canonical view URL. */
export function linkedInJobUrl(href: string): string | null {
  const url = new URL(href)
  if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null
  // The id may follow the title: /jobs/view/gerencia-de-marketing-at-acme-4483465272
  const id =
    url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})(?:\/|$)/)?.[1] ??
    url.searchParams.get('currentJobId')
  return id && /^\d+$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}/` : null
}

/**
 * Signed-in LinkedIn (2026-11): no <h1>, and class names are hashes that
 * change between releases. What holds: the tab title ("Title | Company |
 * LinkedIn"), the "About the job" heading, and the description's
 * data-testid. The title element is looked for in the same column as that
 * heading, so a card in the job list beside it is never taken for it.
 */
const ABOUT = /^(About the job|Acerca del empleo|Acerca del trabajo)$/i
const MORE = /\n?\s*…?\s*(más|more|see more|ver más|mostrar más|show more)\s*$/i

export function signedInJob(doc: Document): {
  titleEl: HTMLElement | null
  title: string
  company: string
  location: string
  description: string
} | null {
  const heading = [...doc.querySelectorAll<HTMLElement>('h2, h3')].find((h) =>
    ABOUT.test(clean(h.textContent)),
  )
  if (!heading) return null
  let section: HTMLElement | null = heading
  for (let i = 0; section && i < 10; i++) {
    if (section.querySelector('[data-testid="expandable-text-box"]')) break
    section = section.parentElement
  }
  const box = section?.querySelector<HTMLElement>('[data-testid="expandable-text-box"]')
  if (!box) return null
  const parts = doc.title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .split(' | ')
  const company = parts.length > 1 ? (parts.pop() ?? '') : ''
  const title = parts.join(' | ').trim()
  // Climb from the description until the title shows up: that is this
  // posting's own column.
  let titleEl: HTMLElement | null = null
  for (
    let up: HTMLElement | null = section ?? null;
    up && !titleEl && title;
    up = up.parentElement
  ) {
    titleEl =
      [...up.querySelectorAll<HTMLElement>('*')].find(
        (e) => e.children.length === 0 && clean(e.textContent) === title,
      ) ?? null
  }
  let location = ''
  for (
    let up = titleEl?.parentElement ?? null, i = 0;
    up && i < 6 && !location;
    up = up.parentElement, i++
  ) {
    const lines = clean(up.innerText ?? up.textContent)
      .split('\n')
      .map((l) => l.trim())
    const after = lines.slice(lines.indexOf(title) + 1)
    location =
      after
        .find((l) => l.includes('·'))
        ?.split('·')[0]
        ?.trim() ?? ''
  }
  return {
    titleEl,
    title,
    company,
    location,
    description: bodyOf(box).replace(MORE, '').trim(),
  }
}

function fromLinkedIn(doc: Document, href: string): PagePosting | null {
  const url = linkedInJobUrl(href)
  if (!url) return null
  const description = first(doc, [
    '#job-details',
    '.jobs-description__content',
    '.jobs-description-content__text',
    '[class*="jobs-description"]',
    '.show-more-less-html__markup',
    '.description__text',
  ])
  if (!description) {
    const job = signedInJob(doc)
    if (!job?.description) return null
    const { title, company, location, description: text } = job
    return { title, company, location, text, url, source: 'linkedin' }
  }
  const title = textOf(
    first(doc, [
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      'h1',
    ]),
  )
  const company = textOf(
    first(doc, [
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '[data-test-id="job-company-name"]',
    ]),
  )
  const location = textOf(
    first(doc, [
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
    ]),
  )
  return {
    title,
    company,
    location: location.split('·')[0]?.trim() ?? '',
    text: bodyOf(description).replace(/^(About the job|Acerca del empleo)\s*/i, ''),
    url,
    source: 'linkedin',
  }
}

export function extractPosting(doc: Document, href: string, selection = ''): PagePosting {
  const picked = clean(selection)
  if (picked.length >= 80) {
    return { title: '', company: '', location: '', text: picked, url: href, source: 'selection' }
  }
  const linkedin = fromLinkedIn(doc, href)
  if (linkedin && linkedin.text.length >= 80) return linkedin
  const main = first(doc, ['main', '[role="main"]', 'article']) ?? doc.body
  return {
    title: clean(doc.querySelector('h1')?.textContent),
    company: '',
    location: '',
    text: textOf(main),
    url: href,
    source: 'page',
  }
}

/** The text the triage console starts from, as a posting reads. */
export function postingText(p: PagePosting): string {
  const head = [p.title, [p.company, p.location].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join('\n')
  return [head, p.text].filter(Boolean).join('\n\n')
}
