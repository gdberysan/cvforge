import { describe, expect, it } from 'vitest'
import { claims } from '@/lib/prep/pipeline'

describe('claims', () => {
  it('splits full stops, and never inside a figure', () => {
    expect(claims('I ran the funnel. Conversion held at 60%.')).toEqual([
      'I ran the funnel.',
      'Conversion held at 60%.',
    ])
    expect(claims('ROAS went from 3.4x to 4.1x and CTR rose 1.2%.')).toHaveLength(1)
  })

  it('splits clauses joined by a semicolon, a colon, a dash or a lowercase start', () => {
    expect(claims('I ran the funnel; the KAMs had one view of stock.')).toEqual([
      'I ran the funnel',
      'the KAMs had one view of stock.',
    ])
    expect(claims('That quarter taught me one thing: the KAMs needed one view of stock.')).toEqual([
      'That quarter taught me one thing',
      'the KAMs needed one view of stock.',
    ])
    expect(claims('I built the weekly report — the KAMs had one view of stock.')).toHaveLength(2)
    expect(claims('I set the budget. then the KAMs had one view of stock.')).toHaveLength(2)
  })

  it('splits a comma that joins a second claim, in English and Spanish', () => {
    expect(claims('I owned the account plan, and then I grew revenue 40% in a year.')).toEqual([
      'I owned the account plan',
      'and then I grew revenue 40% in a year.',
    ])
    expect(
      claims('Armé el reporte semanal, y luego las ventas subieron 30% en un trimestre.'),
    ).toEqual(['Armé el reporte semanal', 'y luego las ventas subieron 30% en un trimestre.'])
  })

  it('keeps lists, labels and abbreviations whole', () => {
    expect(claims('I ran campaigns on Google, Meta, and Amazon.')).toHaveLength(1)
    expect(claims('Result: sales held steady through the launch.')).toHaveLength(1)
    expect(claims('I used automation tools, e.g. n8n and Make, every week.')).toHaveLength(1)
  })
})

describe('claims quoting', () => {
  it('quotes a merged piece exactly as he wrote it', () => {
    expect(claims('I ran campaigns on Google, Meta, and Amazon.')).toEqual([
      'I ran campaigns on Google, Meta, and Amazon.',
    ])
  })
})
