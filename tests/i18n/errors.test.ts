import { describe, expect, it } from 'vitest'
import { errorText, makeTranslate } from '@/lib/i18n'

describe('errorText', () => {
  it('renders a known error code in the active locale', () => {
    const t = makeTranslate('es')
    const text = errorText(t, 'rate-limit', 'Rate limited by the API.')
    expect(text).not.toBe('Rate limited by the API.')
    expect(text).not.toBe('error.rate-limit')
    expect(text.length).toBeGreaterThan(10)
  })

  it('falls back to the server message for an unknown code', () => {
    const t = makeTranslate('es')
    expect(errorText(t, 'not-a-real-code', 'Server said this.')).toBe('Server said this.')
  })

  it('falls back to the server message when no code came at all', () => {
    const t = makeTranslate('es')
    expect(errorText(t, undefined, 'Server said this.')).toBe('Server said this.')
  })
})
