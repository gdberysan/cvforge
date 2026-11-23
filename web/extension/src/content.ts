/**
 * On a LinkedIn job page: one small button beside the posting, "Analizar en
 * CVForge". A click reads the posting already on screen (extract.ts) and
 * asks the extension to open the side panel with it. Nothing runs until the
 * click, and nothing is fetched from LinkedIn.
 *
 * LinkedIn is a single-page app that rebuilds its DOM as you move between
 * jobs: the button lives in its own shadow root and is put back whenever the
 * page drops it, rather than assuming it survives a navigation.
 */
import { extractPosting, linkedInJobUrl, signedInJob } from './extract'

const HOST_ID = 'cvforge-analyse'
// The page's own language first: LinkedIn may be in Spanish in an English browser.
const label = () =>
  (document.documentElement.lang || navigator.language).toLowerCase().startsWith('es')
    ? 'Analizar en Rumbo'
    : 'Analyse in Rumbo'

function anchor(): HTMLElement | null {
  const signedIn = signedInJob(document)?.titleEl
  if (signedIn) return signedIn
  return document.querySelector<HTMLElement>(
    [
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      '.jobs-details h1',
    ].join(','),
  )
}

function mount(): void {
  // Cheap check first: the signed-in page has no stable class to look up,
  // so finding the title walks the job's column.
  if (document.getElementById(HOST_ID)) return
  const at = anchor()
  if (!at) return
  const host = document.createElement('span')
  host.id = HOST_ID
  // Its own line under the title, wherever the title sits.
  host.style.display = 'block'
  const root = host.attachShadow({ mode: 'closed' })
  // Built node by node, never from an HTML string: signed-in LinkedIn
  // enforces Trusted Types, which turned innerHTML markup into plain text.
  const style = document.createElement('style')
  // The app's own colours: ink, and the amber check of its icon.
  style.textContent = `
    button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:8px 0;
      padding:6px 14px;border-radius:999px;font:600 14px/1.2 system-ui,sans-serif;
      background:#17171A;color:#fff}
    button:hover{background:#2B2B30}
    button:focus-visible{outline:2px solid #17171A;outline-offset:2px}
    svg{flex:none}`
  const button = document.createElement('button')
  button.type = 'button'
  const SVG = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(SVG, 'svg')
  for (const [k, v] of [
    ['width', '14'],
    ['height', '14'],
    ['viewBox', '0 0 24 24'],
    ['fill', 'none'],
    ['aria-hidden', 'true'],
  ])
    svg.setAttribute(k, v)
  const check = document.createElementNS(SVG, 'path')
  for (const [k, v] of [
    ['d', 'M5 12.5l4.5 4.5L19 7.5'],
    ['stroke', '#F0A35E'],
    ['stroke-width', '3'],
    ['stroke-linecap', 'round'],
    ['stroke-linejoin', 'round'],
  ])
    check.setAttribute(k, v)
  svg.append(check)
  const text = document.createElement('span')
  text.textContent = label()
  button.append(svg, text)
  root.append(style, button)
  button.addEventListener('click', () => {
    const posting = extractPosting(document, location.href, String(window.getSelection() ?? ''))
    lastSeen = posting.url
    void chrome.runtime.sendMessage({ type: 'cvforge:analyse', posting })
  })
  at.insertAdjacentElement('afterend', host)
}

/**
 * Moving to another job in the list tells the extension which job is now
 * on screen, so an open side panel can follow it. Sent once per job, and
 * only once the page shows that job's own description (LinkedIn empties
 * the column between jobs, so a half-drawn page reads as nothing).
 */
let lastSeen = ''
function announce(): void {
  const url = linkedInJobUrl(location.href)
  if (!url || url === lastSeen) return
  const posting = extractPosting(document, location.href)
  if (posting.source !== 'linkedin' || posting.url !== url) return
  lastSeen = url
  try {
    void chrome.runtime.sendMessage({ type: 'cvforge:seen', posting })
  } catch {
    // The extension was reloaded under this page: nothing to tell.
  }
}

function settle(): void {
  mount()
  announce()
}

/** Open while this page lives: its closing tells the extension the tab left. */
function stayInTouch(): void {
  try {
    chrome.runtime.connect({ name: 'cvforge-page' }).onDisconnect.addListener(() => {
      // The extension's worker slept and dropped it: say hello again.
      setTimeout(stayInTouch, 1000)
    })
  } catch {
    // The extension was reloaded under this page.
  }
}
stayInTouch()

settle()
// LinkedIn changes its page many times a second; look again only once it
// has been still for a moment.
let pending: number | undefined
new MutationObserver(() => {
  clearTimeout(pending)
  pending = window.setTimeout(settle, 250)
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
})
