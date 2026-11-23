// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PushCard } from '@/components/settings/PushCard'

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (url === '/api/push/subscriptions')
    return Promise.resolve(
      Response.json({
        devices: [{ endpoint: 'https://fcm.example/a', label: 'S25', lastOkAt: null }],
      }),
    )
  if (url === '/api/push/quiet' && !init)
    return Promise.resolve(Response.json({ start: 22, end: 8 }))
  return Promise.resolve(Response.json({ ok: true }))
})

afterEach(() => {
  cleanup()
  fetchMock.mockClear()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
})

describe('PushCard', () => {
  it('lists subscribed devices and says when this browser cannot receive pushes', async () => {
    vi.stubGlobal('fetch', fetchMock)
    render(<PushCard />)
    expect(await screen.findByText('S25')).toBeTruthy()
    // jsdom has no PushManager
    expect(screen.getByText(/cannot receive notifications/i)).toBeTruthy()
  })

  it('saves quiet hours when one is changed', async () => {
    vi.stubGlobal('fetch', fetchMock)
    render(<PushCard />)
    const from = (await screen.findByLabelText(/from/i)) as HTMLSelectElement
    await waitFor(() => expect(from.value).toBe('22'))
    fireEvent.change(from, { target: { value: '23' } })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/push/quiet',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ start: 23, end: 8 }) }),
      ),
    )
  })

  it.each([
    ['failed', 'No device received the test.'],
    ['no-devices', 'No device has notifications on yet.'],
    ['sent', 'Test sent.'],
  ])('reports a %s test honestly', async (result, text) => {
    // A browser that can receive pushes: only then is "Send a test" offered.
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    Object.defineProperty(window, 'PushManager', { value: () => {}, configurable: true })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url === '/api/push/test'
          ? Promise.resolve(Response.json({ result }))
          : fetchMock(url, init),
      ),
    )
    render(<PushCard />)
    fireEvent.click(await screen.findByRole('button', { name: /send a test/i }))
    expect(await screen.findByText(text)).toBeTruthy()
  })
})
