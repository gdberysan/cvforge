// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { Nav } from '@/components/ui/Nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ refresh() {} }) }))
afterEach(cleanup)

describe('top bar', () => {
  it('shows the spend as a labelled pill that opens Números', () => {
    render(
      <LocaleProvider locale="es">
        <Nav started spendUsd={24.25} />
      </LocaleProvider>,
    )
    const pill = screen.getByRole('link', { name: /24\.25/ })
    expect(pill.getAttribute('href')).toBe('/stats')
    expect(pill.className).toContain('spend-pill')
    expect(pill.textContent).toContain('gastado')
  })

  it('the language is a compact two-option toggle with the current one marked', () => {
    render(
      <LocaleProvider locale="es">
        <Nav started />
      </LocaleProvider>,
    )
    const group = screen.getByRole('group', { name: 'Idioma' })
    expect(group.className).toContain('locale-toggle')
    expect(screen.getByRole('button', { name: 'es' }).getAttribute('aria-current')).toBe('true')
  })

  it('holds no inline layout: the bar is drawn by its classes', () => {
    const { container } = render(<Nav started spendUsd={1} />)
    expect(container.querySelector('nav.topnav')).toBeTruthy()
    expect(container.querySelectorAll('[style]')).toHaveLength(0)
  })
})
