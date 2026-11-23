// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackLink } from '@/components/ui/BackLink'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
afterEach(() => {
  cleanup()
  push.mockReset()
})

describe('BackLink', () => {
  it('is a link back, and Esc goes there', () => {
    render(<BackLink href="/" label="Hoy" />)
    expect(screen.getByRole('link', { name: 'Hoy' }).getAttribute('href')).toBe('/')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('the first Esc only leaves the box you are typing in', () => {
    render(
      <>
        <BackLink href="/" label="Hoy" />
        <textarea aria-label="vacante" defaultValue="texto a medias" />
      </>,
    )
    const box = screen.getByRole('textbox', { name: 'vacante' })
    box.focus()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(push).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(box)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('leaves Esc to an open sheet', () => {
    render(
      <>
        <BackLink href="/" label="Hoy" />
        <div role="dialog" />
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(push).not.toHaveBeenCalled()
  })
})
