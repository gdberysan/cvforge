// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { TrialOutSheet } from '@/web/lib/trial-out'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

/** A paid step failing the way a screen raises it. */
const fail = async (code: string) => {
  await act(async () => {
    new ApiFailure('x', code)
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('the free trial running out', () => {
  // 2026-11-24, on an S25: the trial ended as red text under the CV, saying
  // "add your own key in Settings" with no way there and no word on why.
  it('opens one sheet that says which limit it was and leads to the key', async () => {
    render(
      <LocaleProvider locale="es">
        <TrialOutSheet />
      </LocaleProvider>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    await fail('trial-ended')
    expect(screen.getByRole('dialog').textContent).toContain('Se acabó tu prueba gratis')
    expect(screen.getByRole('link', { name: 'Conectar mi clave' }).getAttribute('href')).toBe(
      '/settings#clave',
    )
  })

  it('tells a step too big for what is left apart from a full day', async () => {
    render(
      <LocaleProvider locale="es">
        <TrialOutSheet />
      </LocaleProvider>,
    )
    await fail('trial-short')
    expect(screen.getByRole('dialog').textContent).toContain('ya no alcanza para este paso')
    await fail('trial-unavailable')
    expect(screen.getByRole('dialog').textContent).toContain('llena por hoy')
  })

  it('stays out of every other failure', async () => {
    render(
      <LocaleProvider locale="es">
        <TrialOutSheet />
      </LocaleProvider>,
    )
    await fail('rate-limit')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
