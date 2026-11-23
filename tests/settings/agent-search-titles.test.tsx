// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const saveSearchTitlesAction = vi.fn(async (titles: string[]) => ({ ok: true as const, titles }))
vi.mock('@/app/(app)/settings/actions', () => ({
  saveSearchTitlesAction: (t: string[]) => saveSearchTitlesAction(t),
}))

const { AgentSearchTitles } = await import('@/components/settings/AgentSearchTitles')

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

const samples = ['Especialista en PPC', 'Account Manager', 'Gerente de Mercadotecnia']

const open = (titles = ['PPC Specialist'], searchKeywords: string[] = []) => {
  render(
    <LocaleProvider locale="es">
      <AgentSearchTitles
        titles={titles}
        samples={samples}
        searchKeywords={searchKeywords}
        profileTitles={[]}
      />
    </LocaleProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
}

const verdictOf = (title: string) =>
  within(screen.getByText(title).closest('li') as HTMLElement).getByText(
    /Pasa el filtro de títulos|No pasa el filtro/,
  ).textContent

describe('AgentSearchTitles', () => {
  it('summarises the count on the row', () => {
    render(
      <LocaleProvider locale="es">
        <AgentSearchTitles
          titles={['A', 'B']}
          samples={[]}
          searchKeywords={[]}
          profileTitles={[]}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText('Puestos que busca el agente')).toBeTruthy()
    expect(screen.getByText('2 puestos')).toBeTruthy()
  })

  it('previews the recent postings with the same rule the agent uses, live as titles change', () => {
    open()
    expect(verdictOf('Especialista en PPC')).toBe('Pasa el filtro de títulos')
    expect(verdictOf('Account Manager')).toBe('No pasa el filtro')
    expect(verdictOf('Gerente de Mercadotecnia')).toBe('No pasa el filtro')
    fireEvent.change(screen.getByLabelText('Nuevo puesto'), { target: { value: 'Marketing Lead' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(verdictOf('Gerente de Mercadotecnia')).toBe('Pasa el filtro de títulos')
  })

  it('the agent searches count toward relevance too', () => {
    open(['PPC Specialist'], ['marketing'])
    expect(verdictOf('Gerente de Mercadotecnia')).toBe('Pasa el filtro de títulos')
  })

  it('reorders, removes and saves the list in its new order', async () => {
    open(['A title', 'B title', 'C title'])
    fireEvent.click(screen.getByRole('button', { name: 'Subir C title' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar A title' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar puestos' }))
    await waitFor(() => expect(saveSearchTitlesAction).toHaveBeenCalledWith(['C title', 'B title']))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Guardado/))
  })

  it('shows a refusal', async () => {
    saveSearchTitlesAction.mockResolvedValueOnce({ ok: false, code: 'title-too-long' } as never)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar puestos' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Cada puesto puede tener hasta 80 caracteres.',
      ),
    )
  })

  it('an empty list falls back to the profile titles, as the agent does, and says CVs are unaffected', () => {
    render(
      <LocaleProvider locale="es">
        <AgentSearchTitles
          titles={[]}
          samples={samples}
          searchKeywords={[]}
          profileTitles={['Marketing Lead']}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText(/el agente usa los puestos objetivo de tu perfil/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Tus CV no cambian: usan tu perfil.')).toBeTruthy()
    expect(screen.getByText('Vacantes recientes, revisadas solo por título')).toBeTruthy()
    expect(verdictOf('Gerente de Mercadotecnia')).toBe('Pasa el filtro de títulos')
    expect(verdictOf('Especialista en PPC')).toBe('No pasa el filtro')
  })
})
