/**
 * Opens the side panel with a posting. Two ways in: the content script's
 * button on LinkedIn, or the toolbar icon on any page (the selection, else
 * the page's main text, read with activeTab). The posting is kept in session
 * storage for the panel, which loads the CVForge site with it.
 */
import type { PagePosting } from './extract'

type Pending = { posting: PagePosting; at: number }

async function show(tabId: number, posting: PagePosting): Promise<void> {
  await chrome.storage.session.set({ pending: { posting, at: Date.now() } satisfies Pending })
  await chrome.sidePanel.open({ tabId })
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'cvforge:analyse' || !sender.tab?.id) return
  // Called from the click's message: still the person's gesture, so the
  // panel is allowed to open.
  void show(sender.tab.id, message.posting as PagePosting)
})

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  const tabId = tab.id
  // Open first, inside the gesture; the page is read right after.
  await chrome.sidePanel.open({ tabId })
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['inpage.js'] })
    const [read] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (globalThis as unknown as { __cvforgeRead?: unknown }).__cvforgeRead ?? null,
    })
    if (read?.result) {
      await chrome.storage.session.set({
        pending: { posting: read.result as PagePosting, at: Date.now() } satisfies Pending,
      })
    }
  } catch {
    // A page the extension may not read (chrome://, the store): the panel
    // opens on CVForge with an empty box.
  }
})
