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

/** "https://www.linkedin.com/jobs/view/123/?trk=…" or "?currentJobId=123" -> the canonical view URL. */
export function linkedInJobUrl(href: string): string | null {
  const url = new URL(href)
  if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null
  const id = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] ?? url.searchParams.get('currentJobId')
  return id && /^\d+$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}/` : null
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
  if (!description) return null
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
    text: textOf(description).replace(/^(About the job|Acerca del empleo)\s*/i, ''),
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
