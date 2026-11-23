// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const addSearchAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
const toggleSearchAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
const deleteSearchAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('@/app/(app)/settings/actions', () => ({
  addSearchAction: (...a: unknown[]) => addSearchAction(...a),
  toggleSearchAction: (...a: unknown[]) => toggleSearchAction(...a),
  deleteSearchAction: (...a: unknown[]) => deleteSearchAction(...a),
}))

const { AgentSearches } = await import('@/components/settings/AgentSearches')

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

const searches = [
  {
    id: 'default-1',
    label: 'Growth MX',
    keywords: 'growth marketing',
    location: 'Mexico',
    remote: false,
    enabled: true,
  },
  {
    id: 's-1',
    label: 'Automation',
    keywords: 'marketing automation',
    location: 'Mexico',
    remote: true,
    enabled: false,
  },
]

const open = () => {
  render(
    <LocaleProvider locale="es">
      <AgentSearches searches={searches} />
    </LocaleProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Editar búsquedas' }))
}

describe('AgentSearches — what /buscar did, in Ajustes', () => {
  it('says how many are on, and lists each with what it looks for', () => {
    open()
    expect(screen.getByText('1 activa de 2')).toBeTruthy()
    expect(screen.getByText('growth marketing · Mexico')).toBeTruthy()
    expect(screen.getByText('marketing automation · Mexico · remoto')).toBeTruthy()
  })

  it('turns a search off with its switch', async () => {
    open()
    fireEvent.click(screen.getByRole('switch', { name: 'Growth MX' }))
    await waitFor(() => expect(toggleSearchAction).toHaveBeenCalledWith('default-1', false))
  })

  it('deletes only after a second, confirming tap', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Growth MX' }))
    expect(deleteSearchAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar Growth MX' }))
    await waitFor(() => expect(deleteSearchAction).toHaveBeenCalledWith('default-1'))
  })

  it('adds a search from the form', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend' } })
    fireEvent.change(screen.getByLabelText('Palabras clave'), { target: { value: 'node' } })
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'Mexico' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Solo remoto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar búsqueda' }))
    await waitFor(() =>
      expect(addSearchAction).toHaveBeenCalledWith({
        label: 'Backend',
        keywords: 'node',
        location: 'Mexico',
        remote: true,
      }),
    )
  })

  it('shows why an add was refused', async () => {
    addSearchAction.mockResolvedValueOnce({
      ok: false,
      code: 'search-duplicate',
      error: 'x',
    } as never)
    open()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'growth mx' } })
    fireEvent.change(screen.getByLabelText('Palabras clave'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'Mexico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar búsqueda' }))
    expect(await screen.findByText('Ya hay una búsqueda con ese nombre.')).toBeTruthy()
  })
})
