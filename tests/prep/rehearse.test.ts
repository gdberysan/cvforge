import { describe, expect, it } from 'vitest'
import { readRehearsal, TARGETS } from '@/lib/prep/rehearse'

const prepared = 'I ran a 150,000 MXN budget at 3.4x ROAS and cut reporting time by 40%.'

describe('readRehearsal', () => {
  it('reads pace against the target', () => {
    const at = (seconds: number) =>
      readRehearsal({ seconds, transcript: '', prepared, target: TARGETS.pitch, language: 'en' })
        .pace
    expect([at(30), at(60), at(95)]).toEqual(['short', 'good', 'long'])
  })

  it('compares figures by value, not by digits', () => {
    const r = readRehearsal({
      seconds: 60,
      transcript: 'I ran a budget of 150000 MXN at 3,4x and grew sales 18%.',
      prepared,
      target: TARGETS.pitch,
      language: 'en',
    })
    expect(r.landed).toEqual(['150,000 MXN', '3.4x'])
    expect(r.missed).toEqual(['40%'])
    expect(r.unprepared).toEqual(['18%'])
  })

  it('never reads 1.8% as the 18% it is not', () => {
    const r = readRehearsal({
      seconds: 60,
      transcript: 'sales grew 1.8%',
      prepared: 'sales grew 18%',
      target: TARGETS.pitch,
      language: 'en',
    })
    expect(r.landed).toEqual([])
    expect(r.unprepared).toEqual(['1.8%'])
  })

  it('counts words, pace and Spanish fillers', () => {
    const r = readRehearsal({
      seconds: 30,
      transcript: 'Este, pues trabajé en ventas, o sea, este, en marketplaces',
      prepared,
      target: TARGETS.story,
      language: 'es',
    })
    expect(r.words).toBe(10)
    expect(r.wpm).toBe(20)
    expect(r.fillers).toEqual([
      { word: 'este', count: 2 },
      { word: 'o sea', count: 1 },
    ])
  })

  it('leaves "este" as a word when no pause follows it', () => {
    const r = readRehearsal({
      seconds: 30,
      transcript: 'En este proyecto bajé el costo',
      prepared,
      target: TARGETS.story,
      language: 'es',
    })
    expect(r.fillers).toEqual([])
  })

  it('has no pace in words without a transcript', () => {
    const r = readRehearsal({
      seconds: 50,
      transcript: ' ',
      prepared,
      target: TARGETS.pitch,
      language: 'es',
    })
    expect(r.words).toBe(0)
    expect(r.wpm).toBeNull()
    expect(r.missed).toHaveLength(3)
  })
})
