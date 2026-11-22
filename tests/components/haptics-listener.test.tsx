// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HapticsListener } from '@/components/ui/HapticsListener'

let vibrate: ReturnType<typeof vi.fn>
let now = 5_000_000

beforeEach(() => {
  vibrate = vi.fn(() => true)
  vi.stubGlobal('navigator', { ...navigator, vibrate })
  now += 60_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** jsdom has no PointerEvent: a MouseEvent carrying pointerType is what the listener reads. */
function press(el: Element, type: 'pointerdown' | 'click', pointerType: string) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  el.dispatchEvent(e)
}

function mount(html: string) {
  render(<HapticsListener />)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  return host
}

describe('HapticsListener', () => {
  it('ticks the moment a finger touches a bottom-bar destination', () => {
    const host = mount(
      '<nav class="bottomnav"><a href="/pipeline"><span>Postulaciones</span></a></nav>',
    )
    press(host.querySelector('span') as Element, 'pointerdown', 'touch')
    expect(vibrate).toHaveBeenCalledWith(8)
  })

  it('stays quiet for a mouse or a trackpad', () => {
    const host = mount('<nav class="bottomnav"><a href="/pipeline">Postulaciones</a></nav>')
    press(host.querySelector('a') as Element, 'pointerdown', 'mouse')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('does not tick for the section you are already in', () => {
    const host = mount('<nav class="bottomnav"><a href="/" aria-current="page">Hoy</a></nav>')
    press(host.querySelector('a') as Element, 'pointerdown', 'touch')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('ticks an application step', () => {
    const host = mount(
      '<nav class="stepnav"><a class="stepnav-item" href="?step=docs">Docs</a></nav>',
    )
    press(host.querySelector('a') as Element, 'pointerdown', 'touch')
    expect(vibrate).toHaveBeenCalledWith(8)
  })

  it('waits for a confirmed tap on a choice that can sit in a scrolling row', () => {
    const host = mount(
      '<div class="segmented"><label><input type="radio" name="f" /> Sin números</label></div>',
    )
    const label = host.querySelector('label') as Element
    press(label, 'pointerdown', 'touch')
    expect(vibrate).not.toHaveBeenCalled()
    press(label, 'click', 'touch')
    expect(vibrate).toHaveBeenCalledWith(8)
  })

  it('ignores taps on things that are not a place to switch to', () => {
    const host = mount('<main><button type="button">Guardar</button></main>')
    press(host.querySelector('button') as Element, 'pointerdown', 'touch')
    press(host.querySelector('button') as Element, 'click', 'touch')
    expect(vibrate).not.toHaveBeenCalled()
  })
})
