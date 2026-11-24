import { ANDROID_DOWNLOAD, blockedInApp, platformOf } from './in-app'

/** Saves a file. Revoked later: Safari cancels a download whose URL dies at once. */
export function saveBlob(blob: Blob, name: string): void {
  // Inside LinkedIn's browser a download does nothing; the screen says why instead.
  if (blockedInApp()) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  if (platformOf(navigator.userAgent) === 'android')
    window.dispatchEvent(new Event(ANDROID_DOWNLOAD))
}

/** Saves a response as a file, named as the server named it. */
export async function saveResponse(res: Response, fallbackName: string): Promise<void> {
  if (blockedInApp()) return
  const name = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? fallbackName
  saveBlob(await res.blob(), name)
}

/**
 * No engine on this machine: print the identical template via the browser
 * dialog. A hidden iframe, not a popup: window.open returns null when
 * popups are blocked (so nothing happened), and its `load` could fire for
 * the initial about:blank before the CV arrived — printing a blank page.
 * The iframe prints only after its own document has loaded.
 */
export function printHtml(html: string): void {
  if (blockedInApp()) return
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) return
    w.addEventListener('afterprint', () => frame.remove())
    w.focus()
    w.print()
  }
  frame.srcdoc = html
  document.body.appendChild(frame)
}
