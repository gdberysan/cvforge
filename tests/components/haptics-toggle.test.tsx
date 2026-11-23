// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HapticsToggle } from '@/components/settings/HapticsToggle'
import { hapticsOn } from '@/lib/ui/haptics'

let vibrate: ReturnType<typeof vi.fn>

function device({ touch, canVibrate }: { touch: boolean; canVibrate: boolean }) {
  vibrate = vi.fn(() => true)
  vi.stubGlobal('navigator', { ...navigator, vibrate: canVibrate ? vibrate : undefined })
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && touch }))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HapticsToggle', () => {
  it('is offered on a phone that can vibrate, on by default', () => {
    device({ touch: true, canVibrate: true })
    render(<HapticsToggle />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('is not offered where it would do nothing', () => {
    device({ touch: false, canVibrate: true })
    render(<HapticsToggle />)
    expect(screen.queryByRole('switch')).toBeNull()
    cleanup()
    device({ touch: true, canVibrate: false })
    render(<HapticsToggle />)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('turns off for this device, and turning it back on lets you feel it', () => {
    device({ touch: true, canVibrate: true })
    render(<HapticsToggle />)
    fireEvent.click(screen.getByRole('switch'))
    expect(hapticsOn()).toBe(false)
    expect(vibrate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch'))
    expect(hapticsOn()).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(12)
  })
})
