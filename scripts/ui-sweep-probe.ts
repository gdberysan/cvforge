/** Runs inside the page (Playwright evaluate) — no imports, no closures over Node. */
export function probe(doc: Document, win: Window, phone: boolean) {
  const visible = (el: Element) => {
    const s = win.getComputedStyle(el)
    return (
      s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      !(el as HTMLElement).hidden &&
      !el.closest('[hidden]')
    )
  }
  const describe = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`
  const smallTargets: string[] = []
  if (phone) {
    for (const el of doc.querySelectorAll(
      'a[href], button, [role="button"], [role="radio"], input, select, textarea, summary',
    )) {
      if (!visible(el) || el.closest('.sr-only')) continue
      // A transparent control (a styled radio) is tapped through its visible label.
      if (win.getComputedStyle(el).opacity === '0') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // Off-screen until focused (the skip link): not a touch target.
      if (r.bottom <= 0 || r.right <= 0 || r.top >= doc.documentElement.scrollHeight) continue
      // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
      if (
        el.tagName === 'A' &&
        win.getComputedStyle(el).display === 'inline' &&
        el.parentElement?.closest('p, li')
      )
        continue
      if (r.width < 44 || r.height < 44)
        smallTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }
  const tinyText: string[] = []
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const words: string[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    const text = n.textContent?.trim() ?? ''
    if (
      !el ||
      !text ||
      !visible(el) ||
      el.closest('script, style, noscript, .sr-only, [aria-hidden="true"]')
    )
      continue
    words.push(...text.split(/\s+/))
    const size = Number.parseFloat(win.getComputedStyle(el).fontSize)
    if (size && size < 12) tinyText.push(`${describe(el)} ${size}px`)
  }
  return {
    overflowX: doc.documentElement.scrollWidth - win.innerWidth,
    smallTargets,
    tinyText,
    height: doc.documentElement.scrollHeight,
    words: words.length,
  }
}
