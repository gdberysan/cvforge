// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const saveAgentSettingsAction = vi.fn(async () => ({ ok: true }))
const setUpdateCheckAction = vi.fn(async () => ({ ok: true }))
vi.mock('@/app/(app)/settings/actions', () => ({
  saveApiKeyAction: vi.fn(async () => ({ ok: true })),
  clearApiKeyAction: vi.fn(async () => ({ ok: true })),
  setUpdateCheckAction: (...a: unknown[]) => setUpdateCheckAction(...(a as [])),
  installPdfEngineAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { ApiKeyForm } = await import('@/components/settings/ApiKeyForm')
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

describe('Ajustes — the rest', () => {
  it('updates are a switch', () => {
    es(<UpdateToggle enabled={false} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(setUpdateCheckAction).toHaveBeenCalledWith(true)
  })
})
