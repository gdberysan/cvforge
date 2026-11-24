/**
 * Copies text, and says whether it worked. The Clipboard API is refused in
 * some embedded browsers (the one inside LinkedIn among them) and on pages
 * without focus; the older selection copy still works in most of them.
 * Callers show "copied" only on true, and say so on false: a copy button
 * that does nothing reads as a copy that happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through to the selection copy.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
