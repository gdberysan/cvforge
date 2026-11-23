// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { keepInView } from '@/lib/ui/keep-in-view'

describe('keepInView', () => {
  it('scrolls a field hidden by the keyboard to the centre, and again when the keyboard finishes opening', () => {
    const el = document.createElement('textarea')
    el.getBoundingClientRect = () => ({ top: 700, bottom: 740 }) as DOMRect
    el.scrollIntoView = vi.fn()
    const listeners: Record<string, () => void> = {}
    const vv = {
      offsetTop: 0,
      height: 400,
      addEventListener: (k: string, f: () => void) => {
        listeners[k] = f
      },
      removeEventListener: vi.fn(),
    }
    keepInView(el, { visualViewport: vv, innerHeight: 800, setTimeout } as unknown as Window)
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    listeners.resize()
    expect(el.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('leaves a visible field alone', () => {
    const el = document.createElement('input')
    el.getBoundingClientRect = () => ({ top: 100, bottom: 140 }) as DOMRect
    el.scrollIntoView = vi.fn()
    keepInView(el, { visualViewport: null, innerHeight: 800, setTimeout } as unknown as Window)
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })
})
