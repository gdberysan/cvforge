import { describe, expect, it } from 'vitest'
import { normalizeQuestion } from '@/lib/answers'

describe('normalizeQuestion', () => {
  it('matches the same question across casing, punctuation and spacing', () => {
    expect(normalizeQuestion('Why do you want to work here?')).toBe(
      normalizeQuestion('  why do you want to  work here  '),
    )
  })

  it('keeps different questions apart', () => {
    expect(normalizeQuestion('Why us?')).not.toBe(normalizeQuestion('Why you?'))
  })

  it('survives Spanish punctuation', () => {
    expect(normalizeQuestion('¿Por qué quieres trabajar aquí?')).toBe(
      normalizeQuestion('por que quieres trabajar aqui'),
    )
  })
})
