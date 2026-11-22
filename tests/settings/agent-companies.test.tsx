// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { dictionary } from '@/lib/i18n/dictionary'

const { en, es } = dictionary

const addCompanyAction = vi.fn(async (..._a: unknown[]) => ({
  ok: true,
  company: { site: 'lever' },
}))
const toggleCompanyAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
const deleteCompanyAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('@/app/(app)/settings/actions', () => ({
  addCompanyAction: (...a: unknown[]) => addCompanyAction(...a),
  toggleCompanyAction: (...a: unknown[]) => toggleCompanyAction(...a),
  deleteCompanyAction: (...a: unknown[]) => deleteCompanyAction(...a),
}))

const { AgentCompanies } = await import('@/components/settings/AgentCompanies')

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const recent = new Date(Date.now() - 3 * 3600_000).toISOString()
const companies = [
  {
    id: 'c-1',
    name: 'Acme',
    site: 'lever' as const,
    board: 'acme',
    enabled: true,
    lastCheckedAt: recent,
    lastStatus: 'ok' as const,
    openRoles: 12,
  },
  {
    id: 'c-2',
    name: 'Ghost',
    site: 'ashby' as const,
    board: 'ghost',
    enabled: false,
    lastCheckedAt: recent,
    lastStatus: 'not-found' as const,
    openRoles: null,
  },
]

const open = () => {
  render(
    <LocaleProvider locale="es">
      <AgentCompanies companies={companies} />
    </LocaleProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
}

describe('AgentCompanies', () => {
  it('summarises on the row and lists each company', () => {
    open()
    expect(screen.getByText('2 empresas · 12 vacantes abiertas')).toBeTruthy()
    expect(screen.getByText(/Lever · 12 vacantes · revisada/)).toBeTruthy()
    expect(screen.getByText(/Ashby · página de vacantes no encontrada/)).toBeTruthy()
  })

  it('says roles in the singular and shows an outdated agent instead of hiding the row', () => {
    render(
      <LocaleProvider locale="es">
        <AgentCompanies companies={[{ ...companies[0], openRoles: 1 }]} />
      </LocaleProvider>,
    )
    expect(screen.getByText('1 empresa · 1 vacante abierta')).toBeTruthy()
    cleanup()
    render(
      <LocaleProvider locale="es">
        <AgentCompanies companies={null} />
      </LocaleProvider>,
    )
    expect(screen.getByText('Empresas que sigo')).toBeTruthy()
    expect(screen.getByText(/agente sin actualizar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('adds by name and says where it was found', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Nombre o enlace de empleo'), {
      target: { value: 'Hugging Face' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(screen.getByText('Encontrada en Lever')).toBeTruthy())
    expect(addCompanyAction).toHaveBeenCalledWith({ nameOrUrl: 'Hugging Face' })
  })

  it('shows the reason a company was refused', async () => {
    addCompanyAction.mockResolvedValueOnce({ ok: false, code: 'company-not-found' } as never)
    open()
    fireEvent.change(screen.getByLabelText('Nombre o enlace de empleo'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/No encontré/))
  })

  it('asks before deleting', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Acme' }))
    expect(deleteCompanyAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar Acme' }))
    await waitFor(() => expect(deleteCompanyAction).toHaveBeenCalledWith('c-1'))
  })
})

describe('dictionary', () => {
  it('has every companies key and company error in en and es', () => {
    const keys = Object.keys(en).filter(
      (k) =>
        k.startsWith('settings.agent.companies') || /^error\.(company-|agent-outdated)/.test(k),
    )
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) expect(es).toHaveProperty([k])
    for (const k of Object.keys(es).filter((k) => k.startsWith('settings.agent.companies')))
      expect(en).toHaveProperty([k])
  })
})
