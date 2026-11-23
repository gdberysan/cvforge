// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { dictionary } from '@/lib/i18n/dictionary'

const { en, es } = dictionary

const saveCompanyAliasesAction = vi.fn(async (_id: string, aliases: string[]) => ({
  ok: true as const,
  aliases,
}))
vi.mock('@/app/(app)/application/actions', () => ({
  saveCompanyAliasesAction: (id: string, a: string[]) => saveCompanyAliasesAction(id, a),
}))

const { CompanyAliases } = await import('@/components/application/CompanyAliases')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const show = (aliases: string[]) =>
  render(
    <LocaleProvider locale="es">
      <CompanyAliases applicationId="app_1" aliases={aliases} />
    </LocaleProvider>,
  )

describe('CompanyAliases — "También escribe como"', () => {
  it('lists each alias as a removable chip', () => {
    show(['Pavo Pagos', 'pavo.mx'])
    expect(screen.getByText('También escribe como')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitar Pavo Pagos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitar pavo.mx' })).toBeTruthy()
  })

  it('adds one and saves the whole list', async () => {
    show(['Pavo Pagos'])
    fireEvent.change(screen.getByLabelText('Nombre o dominio de correo'), {
      target: { value: 'pavo.mx' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() =>
      expect(saveCompanyAliasesAction).toHaveBeenCalledWith('app_1', ['Pavo Pagos', 'pavo.mx']),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar pavo.mx' })).toBeTruthy())
  })

  it('removes one', async () => {
    show(['Pavo Pagos', 'pavo.mx'])
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pavo Pagos' }))
    await waitFor(() => expect(saveCompanyAliasesAction).toHaveBeenCalledWith('app_1', ['pavo.mx']))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Quitar Pavo Pagos' })).toBeNull(),
    )
  })

  it('shows the refusal and keeps the list as it was', async () => {
    saveCompanyAliasesAction.mockResolvedValueOnce({
      ok: false,
      code: 'aliases-too-many',
      error: 'x',
    } as never)
    show(['a'])
    fireEvent.change(screen.getByLabelText('Nombre o dominio de correo'), {
      target: { value: 'b' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(es['error.aliases-too-many']),
    )
    expect(screen.queryByRole('button', { name: 'Quitar b' })).toBeNull()
  })

  it('a blank entry saves nothing', () => {
    show([])
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(saveCompanyAliasesAction).not.toHaveBeenCalled()
  })
})

describe('dictionary', () => {
  it('has every alias and target-title key in en and es', () => {
    const keys = Object.keys(en).filter(
      (k) => k.startsWith('aliases.') || /^error\.aliases?-/.test(k),
    )
    expect(keys.length).toBeGreaterThan(5)
    for (const k of keys) expect(es).toHaveProperty([k])
  })
})
