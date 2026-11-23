/**
 * The side panel is the CVForge site itself, framed: the same data as its
 * tab (an extension page with host permission for the site is not storage-
 * partitioned — tested), the same screens.
 *
 * The first posting arrives in the URL (?job=&company=&location=&url=&text=,
 * so Analizar starts on the job's country). After that, while the framed
 * analyse screen is showing, a new posting is handed to it in place
 * (web/lib/frame-signal.ts): only the job changes, nothing reloads or
 * flashes. Two ways one arrives: the button (always shown), and moving to
 * another job on LinkedIn (`seen`), which is shown only while the screen's
 * posting is untouched; otherwise a bar on top offers it, so a running
 * analysis or a result being read is never wiped.
 */
import type { PagePosting } from './extract'

declare const CVFORGE_SITE: string

const SITE = new URL(CVFORGE_SITE).origin
const frame = document.getElementById('site') as HTMLIFrameElement
const bar = document.getElementById('next') as HTMLDivElement
const es = chrome.i18n.getUILanguage().toLowerCase().startsWith('es')
// This panel's tab: each tab has its own panel and its own job.
const tab = new URLSearchParams(location.search).get('tab') ?? ''
const PENDING = `pending:${tab}`
const SEEN = `seen:${tab}`

let shown: string | null = null
// What the framed site last said; nothing until it speaks.
let screen = { share: false, untouched: false }
let offered: PagePosting | null = null

const parts = (p: PagePosting) => ({
  title: p.title,
  company: p.company,
  location: p.location,
  url: p.url,
  text: p.text,
})

function show(posting: PagePosting | null): void {
  offered = null
  bar.hidden = true
  shown = posting?.url ?? null
  // The analyse screen is up: hand the job over, no reload.
  if (posting && screen.share && frame.contentWindow) {
    screen = { share: true, untouched: true }
    frame.contentWindow.postMessage({ type: 'cvforge:posting', posting: parts(posting) }, SITE)
    return
  }
  // Relative to the app's address, which carries its base path (/app/).
  const url = new URL('share/', CVFORGE_SITE)
  if (posting) {
    if (posting.source === 'linkedin' && posting.title) {
      for (const [k, v] of Object.entries({ ...parts(posting), job: posting.title })) {
        if (v && k !== 'title') url.searchParams.set(k, v)
      }
    } else {
      // Not a job read in parts (a selection, a whole page): plain text.
      if (posting.text.length >= 80) url.searchParams.set('text', posting.text)
      if (posting.url) url.searchParams.set('url', posting.url)
    }
  }
  screen = { share: false, untouched: false }
  frame.src = url.toString()
}

function offer(posting: PagePosting): void {
  offered = posting
  const name = [posting.title, posting.company].filter(Boolean).join(' · ')
  ;(bar.firstElementChild as HTMLElement).textContent =
    name || (es ? 'Otra vacante' : 'Another job')
  ;(bar.lastElementChild as HTMLElement).textContent = es ? 'Analizar esta' : 'Analyse this one'
  bar.hidden = false
}

bar.querySelector('button')?.addEventListener('click', () => show(offered))

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== SITE) return
  if (e.data?.type === 'cvforge:frame') {
    screen = { share: e.data.share === true, untouched: e.data.untouched === true }
  }
})

chrome.storage.session.get(PENDING).then((got) => {
  show((got[PENDING] as { posting: PagePosting } | undefined)?.posting ?? null)
})

chrome.storage.session.onChanged.addListener((changes) => {
  // The button: show it, whatever is on screen.
  const next = changes[PENDING]?.newValue as { posting: PagePosting } | undefined
  if (next) return show(next.posting)
  // Another job opened on the page: follow it, or offer it.
  const seen = (changes[SEEN]?.newValue as { posting: PagePosting } | undefined)?.posting
  if (!seen) return
  if (seen.url === shown) {
    bar.hidden = true
    return
  }
  if (screen.share && screen.untouched) show(seen)
  else offer(seen)
})
