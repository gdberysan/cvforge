// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorker } from '@/components/pwa/ServiceWorker'

const unregister = vi.fn(() => Promise.resolve(true))
const register = vi.fn(() => Promise.resolve({}))

function stubNavigator() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations: () => Promise.resolve([{ unregister }]) },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  register.mockClear()
  unregister.mockClear()
})

describe('ServiceWorker registration', () => {
  it('registers the worker in a production build', async () => {
    stubNavigator()
    vi.stubEnv('NODE_ENV', 'production')
    render(<ServiceWorker buildId="b1" />)
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js?v=b1'))
  })

  it('in development, removes any worker instead — dev chunk names are not content-hashed', async () => {
    stubNavigator()
    vi.stubEnv('NODE_ENV', 'development')
    render(<ServiceWorker buildId="b1" />)
    await vi.waitFor(() => expect(unregister).toHaveBeenCalled())
    expect(register).not.toHaveBeenCalled()
  })
})
