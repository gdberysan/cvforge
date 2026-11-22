/**
 * Keeps a focused field above the phone's keyboard. The keyboard opens after
 * focus and shrinks the visual viewport, so the check runs now and once more
 * on the next viewport resize (within a second).
 */
export function keepInView(el: Element, win: Window = window): void {
  const vv = win.visualViewport
  const settle = () => {
    const r = el.getBoundingClientRect()
    const top = vv ? vv.offsetTop : 0
    const bottom = vv ? vv.offsetTop + vv.height : win.innerHeight
    if (r.top < top || r.bottom > bottom - 16) el.scrollIntoView({ block: 'center' })
  }
  settle()
  if (!vv) return
  const once = () => {
    vv.removeEventListener('resize', once)
    settle()
  }
  vv.addEventListener('resize', once)
  win.setTimeout(() => vv.removeEventListener('resize', once), 1000)
}
