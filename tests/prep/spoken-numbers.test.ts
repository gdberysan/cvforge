import { describe, expect, it } from 'vitest'
import { readRehearsal, TARGETS } from '@/lib/prep/rehearse'
import { digitsFromSpeech } from '@/lib/prep/spoken-numbers'

describe('digitsFromSpeech', () => {
  it.each([
    ['en', 'campaigns hit eight times ROAS', 'campaigns hit 8x ROAS'],
    ['en', 'a budget of one hundred fifty thousand pesos', 'a budget of 150000 MXN'],
    ['en', 'three point four times', '3.4x'],
    ['en', 'twenty-five percent', '25 percent'],
    ['es', 'ciento cincuenta mil pesos', '150000 MXN'],
    ['es', 'tres punto cuatro veces', '3.4x'],
    ['es', 'subimos treinta y dos por ciento', 'subimos 32%'],
    ['es', 'un millón de dólares', '1000000 de dólares'],
    ['es', '8 veces', '8x'],
    ['es', '150 mil pesos', '150 mil MXN'],
  ] as const)('%s: %s → %s', (lang, said, expected) => {
    expect(digitsFromSpeech(said, lang)).toBe(expected)
  })

  it('leaves ordinary words alone', () => {
    expect(digitsFromSpeech('Once the team grew, I met them.', 'en')).toBe(
      'Once the team grew, I met them.',
    )
    expect(digitsFromSpeech('I met them every week', 'en')).toBe('I met them every week')
    expect(digitsFromSpeech('Fue una buena semana', 'es')).toBe('Fue 1 buena semana')
  })
})

describe('rehearsal with spoken figures', () => {
  const prepared = 'I ran a 150,000 MXN budget at 3.4x ROAS; tech hit 8x and sales grew 18%.'
  it('counts a figure said in words as said', () => {
    const r = readRehearsal({
      seconds: 60,
      transcript:
        'I ran one hundred fifty thousand pesos at three point four times, tech hit eight times and sales grew eighteen percent',
      prepared,
      target: TARGETS.pitch,
      language: 'en',
    })
    expect(r.missed).toEqual([])
    expect(r.unprepared).toEqual([])
  })
  it('in Spanish too, and still tells 1.8% from 18%', () => {
    const r = readRehearsal({
      seconds: 60,
      transcript:
        'manejé ciento cincuenta mil pesos a tres punto cuatro veces y crecimos uno punto ocho por ciento',
      prepared,
      target: TARGETS.pitch,
      language: 'es',
    })
    expect(r.landed).toEqual(['150,000 MXN', '3.4x'])
    expect(r.unprepared).toEqual(['1.8%'])
  })
})
