// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KitProgress } from '@/components/application/KitProgress'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

let states: string[]
beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
  states = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ phase: states.shift() ?? 'working' }) })),
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('KitProgress', () => {
  it('says the kit is being prepared, in a status region', () => {
    render(
      <LocaleProvider locale="es">
        <KitProgress applicationId="app_1" />
      </LocaleProvider>,
    )
    expect(screen.getByRole('status').textContent).toMatch('Preparando el kit… unos 3 minutos')
  })

  it('asks every 5 seconds and refreshes once the kit lands', async () => {
    states = ['working', 'done']
    render(
      <LocaleProvider locale="es">
        <KitProgress applicationId="app_1" />
      </LocaleProvider>,
    )
    await tick(5_000)
    expect(fetch).toHaveBeenCalledWith('/api/kit/status?applicationId=app_1', expect.anything())
    expect(refresh).not.toHaveBeenCalled()
    await tick(5_000)
    expect(refresh).toHaveBeenCalledOnce()
    await tick(15_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refreshes on a failed kit too, so the page shows what to do', async () => {
    states = ['failed']
    render(
      <LocaleProvider locale="es">
        <KitProgress applicationId="app_1" />
      </LocaleProvider>,
    )
    await tick(5_000)
    expect(refresh).toHaveBeenCalledOnce()
  })
})
