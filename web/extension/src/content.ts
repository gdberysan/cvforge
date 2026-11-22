/**
 * On a LinkedIn job page: one small button beside the posting, "Analizar en
 * CVForge". A click reads the posting already on screen (extract.ts) and
 * asks the extension to open the side panel with it. Nothing runs until the
 * click, and nothing is fetched from LinkedIn.
 *
 * LinkedIn is a single-page app that rebuilds its DOM as you move between
 * jobs: the button lives in its own shadow root and is put back whenever the
 * page drops it (the lesson from Mordue's panel, which had the same problem).
 */
import { extractPosting } from './extract'

const HOST_ID = 'cvforge-analyse'
const label = () =>
  navigator.language.toLowerCase().startsWith('es') ? 'Analizar en CVForge' : 'Analyse in CVForge'

function anchor(): HTMLElement | null {
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
  const at = anchor()
  if (!at || document.getElementById(HOST_ID)) return
  const host = document.createElement('span')
  host.id = HOST_ID
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>
    button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:8px 0;
      padding:6px 14px;border-radius:999px;font:600 14px/1.2 system-ui,sans-serif;
      background:#A8500F;color:#fff}
    button:focus-visible{outline:2px solid #A8500F;outline-offset:2px}
  </style><button type="button"></button>`
  const button = root.querySelector('button') as HTMLButtonElement
  button.textContent = label()
  button.addEventListener('click', () => {
    const posting = extractPosting(document, location.href, String(window.getSelection() ?? ''))
    void chrome.runtime.sendMessage({ type: 'cvforge:analyse', posting })
  })
  at.insertAdjacentElement('afterend', host)
}

mount()
new MutationObserver(() => mount()).observe(document.documentElement, {
  childList: true,
  subtree: true,
})
