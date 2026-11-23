/**
 * Opens the side panel with a posting. Two ways in: the content script's
 * button on LinkedIn, or the toolbar icon on any page (the selection, else
 * the page's main text, read with activeTab).
 *
 * The panel belongs to the tab it was opened from, not to the window:
 * switch tabs and it steps aside, come back and it is there. A panel opened
 * from LinkedIn also closes once that tab leaves LinkedIn. Postings are
 * kept in session storage under the tab's id, so each tab's panel shows its
 * own job.
 */
import type { PagePosting } from './extract'

type Pending = { posting: PagePosting; at: number }

// Opened from LinkedIn's button: closed again when the tab leaves LinkedIn.
const fromLinkedIn = new Set<number>()
// Tabs whose side panel is open now, and each LinkedIn page's port: a page
// follows the job on screen only while its tab's panel is open.
const panelOpen = new Set<number>()
const pages = new Map<number, chrome.runtime.Port>()
function tellPage(tabId: number): void {
  try {
    pages.get(tabId)?.postMessage({ type: 'cvforge:follow', on: panelOpen.has(tabId) })
  } catch {
    // That page's port just closed.
  }
}
const leaving = new Map<number, ReturnType<typeof setTimeout>>()

/** Inside the person's click: enable this tab's panel and open it, no await between. */
function openPanel(tabId: number): Promise<void> {
  void chrome.sidePanel.setOptions({ tabId, path: `panel.html?tab=${tabId}`, enabled: true })
  return chrome.sidePanel.open({ tabId })
}

function closePanel(tabId: number): void {
  fromLinkedIn.delete(tabId)
  void chrome.sidePanel.setOptions({ tabId, enabled: false })
}

// No panel anywhere until a tab asks for one.
chrome.runtime.onInstalled.addListener(() => void chrome.sidePanel.setOptions({ enabled: false }))

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id
  if (!tabId) return
  // The job now on screen, announced only while this tab's panel is open:
  // the panel follows it only while nothing has been started there.
  if (message?.type === 'cvforge:seen') {
    // Only a tab with its panel open is followed.
    if (!panelOpen.has(tabId)) return
    void chrome.storage.session.set({
      [`seen:${tabId}`]: { posting: message.posting, at: Date.now() } satisfies Pending,
    })
    return
  }
  if (message?.type !== 'cvforge:analyse') return
  // Called from the click's message: still the person's gesture.
  fromLinkedIn.add(tabId)
  void openPanel(tabId)
  void chrome.storage.session.set({
    [`pending:${tabId}`]: { posting: message.posting as PagePosting, at: Date.now() },
  })
})

/**
 * Each LinkedIn job page keeps a port open. When it closes (the tab went
 * somewhere else, or closed) and no LinkedIn page reconnects from that tab
 * within a few seconds — a reload does — the panel goes too.
 */
chrome.runtime.onConnect.addListener((port) => {
  // The side panel says it is open (its port closes when it does).
  if (port.name.startsWith('cvforge-panel:')) {
    const panelTab = Number(port.name.slice('cvforge-panel:'.length))
    if (!Number.isInteger(panelTab)) return
    panelOpen.add(panelTab)
    tellPage(panelTab)
    port.onDisconnect.addListener(() => {
      panelOpen.delete(panelTab)
      tellPage(panelTab)
      void chrome.storage.session.remove(`seen:${panelTab}`)
    })
    return
  }
  const tabId = port.sender?.tab?.id
  if (port.name !== 'cvforge-page' || !tabId) return
  clearTimeout(leaving.get(tabId))
  leaving.delete(tabId)
  pages.set(tabId, port)
  tellPage(tabId)
  port.onDisconnect.addListener(() => {
    if (pages.get(tabId) === port) pages.delete(tabId)
    if (!fromLinkedIn.has(tabId)) return
    leaving.set(
      tabId,
      setTimeout(() => {
        leaving.delete(tabId)
        closePanel(tabId)
      }, 6000),
    )
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  fromLinkedIn.delete(tabId)
  panelOpen.delete(tabId)
  pages.delete(tabId)
  void chrome.storage.session.remove([`pending:${tabId}`, `seen:${tabId}`])
})

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  const tabId = tab.id
  // Open first, inside the gesture; the page is read right after.
  await openPanel(tabId)
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['inpage.js'] })
    const [read] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (globalThis as unknown as { __cvforgeRead?: unknown }).__cvforgeRead ?? null,
    })
    if (read?.result) {
      await chrome.storage.session.set({
        [`pending:${tabId}`]: { posting: read.result as PagePosting, at: Date.now() },
      })
    }
  } catch {
    // A page the extension may not read (chrome://, the store): the panel
    // opens on CVForge with an empty box.
  }
})
