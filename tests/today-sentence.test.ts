// tests/today-sentence.test.ts
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@/lib/i18n'
import { greetingKey, todaySentence } from '@/lib/today-sentence'

const es = makeTranslate('es')
const en = makeTranslate('en')

describe('greetingKey', () => {
  it('splits the day at 12 and 19', () => {
    expect([5, 11, 12, 18, 19, 23].map(greetingKey)).toEqual([
      'greet.morning',
      'greet.morning',
      'greet.afternoon',
      'greet.afternoon',
      'greet.evening',
      'greet.evening',
    ])
  })
})

describe('todaySentence', () => {
  it('is calm when nothing is happening', () => {
    expect(todaySentence(es, 'es', { needs: 0, waiting: 0 })).toBe('Nada te espera hoy.')
  })
  it('joins needs and waiting', () => {
    expect(todaySentence(es, 'es', { needs: 2, waiting: 7 })).toBe(
      '2 cosas te esperan y 7 postulaciones siguen en su tiempo normal de respuesta.',
    )
  })
  it('uses singulars', () => {
    expect(todaySentence(es, 'es', { needs: 1, waiting: 1 })).toBe(
      '1 cosa te espera y 1 postulación sigue en su tiempo normal de respuesta.',
    )
  })
  it('says nothing is urgent when only waiting', () => {
    expect(todaySentence(en, 'en', { needs: 0, waiting: 3 })).toBe(
      'Nothing urgent: 3 applications are within their normal reply time.',
    )
  })
})
