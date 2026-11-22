/**
 * The side panel is the CVForge site itself, framed: the same data as its
 * tab (an extension page with host permission for the site is not storage-
 * partitioned — tested), the same screens. A posting from the page arrives
 * as Analizar's ?text=&url=, exactly what a share would send, plus
 * &location= so the market starts on the job's country.
 */
import { type PagePosting, postingText } from './extract'

declare const CVFORGE_SITE: string

const frame = document.getElementById('site') as HTMLIFrameElement

function load(posting: PagePosting | null): void {
  const url = new URL('/share/', CVFORGE_SITE)
  if (posting) {
    const text = postingText(posting)
    if (text.length >= 80) url.searchParams.set('text', text)
    if (posting.url) url.searchParams.set('url', posting.url)
    // Where the job is, so Analizar starts on that country, not yours.
    if (posting.location) url.searchParams.set('location', posting.location)
  }
  frame.src = url.toString()
}

chrome.storage.session.get('pending').then(({ pending }) => {
  load((pending as { posting: PagePosting } | undefined)?.posting ?? null)
})

// A new posting while the panel is open: show it.
chrome.storage.session.onChanged.addListener((changes) => {
  const next = changes.pending?.newValue as { posting: PagePosting } | undefined
  if (next) load(next.posting)
})
