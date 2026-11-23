import { beforeEach, describe, expect, it, vi } from 'vitest'

let cookieValue: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'cvforge_locale' && cookieValue !== undefined ? { value: cookieValue } : undefined,
  }),
}))

const { getLocale } = await import('@/lib/i18n/server')

describe('getLocale', () => {
  beforeEach(() => {
    cookieValue = undefined
  })

  it('renders a first visit (no cookie) in Spanish', async () => {
    expect(await getLocale()).toBe('es')
  })

  it('keeps the language the user picked', async () => {
    cookieValue = 'en'
    expect(await getLocale()).toBe('en')
    cookieValue = 'es'
    expect(await getLocale()).toBe('es')
  })

  it('treats an unknown cookie value as a first visit', async () => {
    cookieValue = 'fr'
    expect(await getLocale()).toBe('es')
  })
})
