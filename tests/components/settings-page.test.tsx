// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const saveAgentSettingsAction = vi.fn(async () => ({ ok: true }))
const setUpdateCheckAction = vi.fn(async () => ({ ok: true }))
const setKitSettingsAction = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('@/app/(app)/settings/actions', () => ({
  saveApiKeyAction: vi.fn(async () => ({ ok: true })),
  clearApiKeyAction: vi.fn(async () => ({ ok: true })),
  saveAgentSettingsAction: (...a: unknown[]) => saveAgentSettingsAction(...(a as [])),
  setUpdateCheckAction: (...a: unknown[]) => setUpdateCheckAction(...(a as [])),
  installPdfEngineAction: vi.fn(),
  setKitSettingsAction: (...a: unknown[]) => setKitSettingsAction(...a),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { ApiKeyForm } = await import('@/components/settings/ApiKeyForm')
const { AgentCard } = await import('@/components/settings/AgentCard')
const { UpdateToggle } = await import('@/components/settings/UpdateToggle')

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
  saveAgentSettingsAction.mockClear()
  setUpdateCheckAction.mockClear()
})
const es = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)

const status = {
  settings: {
    dailyCap: 5,
    digestSize: 3,
    verdictFloor: 'stretch' as const,
    salaryFloor: null,
    wakeStart: 8,
    wakeEnd: 23,
    paused: true,
    followUps: true,
    weeklyReport: true,
  },
  lastTriagedAt: null,
  triagedToday: 0,
}

describe('Ajustes — the key', () => {
  it('from the phone there is no key form at all', () => {
    es(<ApiKeyForm hasSavedKey envManaged={false} local={false} />)
    expect(document.querySelector('#api-key')).toBeNull()
    expect(screen.getByText(/desde la Mac/)).toBeTruthy()
  })

  it('with a key saved it is one row until "Cambiar"', () => {
    es(<ApiKeyForm hasSavedKey envManaged={false} local />)
    expect(document.querySelector('#api-key')).toBeNull()
    expect(screen.getByText('Clave guardada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(document.querySelector('#api-key')).toBeTruthy()
  })

  it('with no key the form is there from the start', () => {
    es(<ApiKeyForm hasSavedKey={false} envManaged={false} local />)
    expect(document.querySelector('#api-key')).toBeTruthy()
  })
})

describe('Ajustes — the agent', () => {
  it('shows its state and pause/resume; the dials open in a sheet', () => {
    es(<AgentCard status={status} />)
    expect(screen.getByRole('button', { name: 'Reanudar el agente' })).toBeTruthy()
    expect(document.querySelector('#agent-dailyCap')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar el agente' }))
    expect(document.querySelector('dialog[open] #agent-dailyCap')).toBeTruthy()
  })

  it('saving from the sheet sends the same settings shape as before', async () => {
    es(<AgentCard status={status} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar el agente' }))
    fireEvent.change(document.querySelector('#agent-dailyCap') as HTMLInputElement, {
      target: { value: '7' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes del agente' }))
    await waitFor(() =>
      expect(saveAgentSettingsAction).toHaveBeenCalledWith({ ...status.settings, dailyCap: 7 }),
    )
  })

  it('closing the sheet without saving drops the unsaved changes', () => {
    es(<AgentCard status={status} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar el agente' }))
    fireEvent.change(document.querySelector('#agent-dailyCap') as HTMLInputElement, {
      target: { value: '9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar el agente' }))
    expect((document.querySelector('#agent-dailyCap') as HTMLInputElement).value).toBe('5')
  })

  it('its message choices are switches', () => {
    es(<AgentCard status={status} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar el agente' }))
    // The two message switches live in the sheet; the kit switch sits outside it.
    expect(document.querySelectorAll('dialog[open] [role="switch"]')).toHaveLength(2)
  })
})

describe('Ajustes — the rest', () => {
  it('updates are a switch', () => {
    es(<UpdateToggle enabled={false} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(setUpdateCheckAction).toHaveBeenCalledWith(true)
  })
})

describe('Ajustes — the agent, stage A', () => {
  const withScan = {
    ...status,
    lastScan: {
      at: new Date(Date.now() - 20 * 60_000).toISOString(),
      seen: 14,
      judged: 3,
      found: 1,
    },
  }

  it('says how often it looks, and what the last look found', () => {
    es(<AgentCard status={withScan} kit={{ onChase: true, dailyCap: 5 }} />)
    expect(document.body.textContent).toMatch('Busca cada ~90 min, de 8 a 23 h')
    expect(document.body.textContent).toMatch(
      'Última búsqueda: hace 20 min · 14 vistas, 3 analizadas, 1 encontradas',
    )
  })

  it('without a scan yet, no scan line', () => {
    es(<AgentCard status={{ ...status, lastScan: null }} kit={{ onChase: true, dailyCap: 5 }} />)
    expect(document.body.textContent).not.toMatch('Última búsqueda')
  })

  it('the kit switch and the daily kits save at once', async () => {
    es(<AgentCard status={withScan} kit={{ onChase: true, dailyCap: 5 }} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Preparar el kit al perseguir' }))
    await waitFor(() =>
      expect(setKitSettingsAction).toHaveBeenCalledWith({ onChase: false, dailyCap: 5 }),
    )
    fireEvent.change(screen.getByLabelText('Kits por día'), { target: { value: '3' } })
    await waitFor(() =>
      expect(setKitSettingsAction).toHaveBeenLastCalledWith({ onChase: false, dailyCap: 3 }),
    )
    expect(document.body.textContent).toMatch('≈ $0.70 por kit')
  })

  it('says when Telegram speaks', () => {
    es(<AgentCard status={withScan} kit={{ onChase: true, dailyCap: 5 }} />)
    expect(document.body.textContent).toMatch(
      'Telegram solo te escribe si algo falla, o si tu teléfono deja de recibir avisos.',
    )
  })
})
