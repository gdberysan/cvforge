import { describe, expect, it } from 'vitest'
import {
  extractCounts,
  extractQuantities,
  normaliseQuantity,
  numbersIn,
} from '@/lib/verify/quantities'

describe('extractQuantities', () => {
  it('extracts percentages', () => {
    expect(extractQuantities('Reduced latency by 40% across the fleet')).toEqual(['40%'])
  })

  it('extracts currency amounts with a symbol', () => {
    expect(extractQuantities('Managed a $1.2M budget')).toEqual(['$1.2M'])
  })

  it('extracts currency amounts with an ISO code', () => {
    expect(extractQuantities('Handled 1.2M MXN in monthly GMV')).toEqual(['1.2M MXN'])
  })

  it('extracts amounts in any Latin American currency code, so they are checked too', () => {
    // An unrecognised code was not a quantity at all: "800M COP" went unchecked.
    expect(extractQuantities('Presupuesto de 800M COP y ARS 1.5M')).toEqual([
      '800M COP',
      'ARS 1.5M',
    ])
    expect(normaliseQuantity('800M COP')).toBe(normaliseQuantity('800,000,000 COP'))
    expect(normaliseQuantity('800M COP')).not.toBe(normaliseQuantity('800M MXN'))
  })

  it('extracts multipliers', () => {
    expect(extractQuantities('Grew throughput 3x')).toEqual(['3x'])
  })

  it('ignores four-digit years, which are not claims', () => {
    expect(extractQuantities('Led the 2018 replatform through 2019')).toEqual([])
  })

  it('ignores bare counts, which are too noisy to verify', () => {
    expect(extractQuantities('Led a team of 6 engineers')).toEqual([])
  })

  it('finds several quantities in one sentence', () => {
    expect(extractQuantities('Cut costs 30% while growing revenue 2x')).toEqual(['30%', '2x'])
  })
})

describe('normaliseQuantity', () => {
  it('reads a Spanish decimal comma as a decimal point, not thousands', () => {
    expect(normaliseQuantity('1,5M')).toBe(normaliseQuantity('1.5M'))
    expect(normaliseQuantity('12,5%')).toBe('12.5%')
  })

  it('still strips true thousands separators', () => {
    expect(normaliseQuantity('$1,500')).toBe('1500')
    expect(normaliseQuantity('1,500,000 MXN')).toBe('1500000mxn')
  })

  it('canonicalises magnitude words so rephrasings still match exactly', () => {
    expect(normaliseQuantity('1.2 million')).toBe(normaliseQuantity('1.2M'))
    expect(normaliseQuantity('2 millones')).toBe(normaliseQuantity('2M'))
    expect(normaliseQuantity('1.2M MXN')).toBe(normaliseQuantity('1,200,000 MXN'))
    expect(normaliseQuantity('12.50%')).toBe(normaliseQuantity('12,5%'))
  })

  it('reads "mil" as a thousand and never tokenises it as "m"', () => {
    expect(extractQuantities('Managed a $12 mil budget')).toEqual(['$12 mil'])
    expect(normaliseQuantity('$12 mil')).toBe('12000')
    expect(normaliseQuantity('$12M')).toBe('12000000')
  })

  it('extracts a currency code written before the number', () => {
    expect(extractQuantities('Drove USD 5M in GMV')).toEqual(['USD 5M'])
    expect(normaliseQuantity('USD 5M')).toBe('5000000usd')
  })

  it('extracts percentages written as words, in both languages', () => {
    expect(extractQuantities('Cut costs 18 percent')).toEqual(['18 percent'])
    expect(extractQuantities('Bajé costos 18 por ciento')).toEqual(['18 por ciento'])
    expect(normaliseQuantity('18 por ciento')).toBe('18%')
  })

  it('extracts both bounds of a range', () => {
    expect(extractQuantities('Lifted conversion 15-20%')).toEqual(['15%', '20%'])
  })

  it('extracts decimal-comma and multiplication-sign multipliers whole', () => {
    expect(extractQuantities('Subí ROAS 3,4x')).toEqual(['3,4x'])
    expect(extractQuantities('Grew throughput 3×')).toEqual(['3×'])
    expect(normaliseQuantity('3,4x')).toBe('3.4x')
    expect(normaliseQuantity('3×')).toBe('3x')
  })

  it('does not read the m of "men" as a million', () => {
    expect(extractQuantities('Managed $5 men')).toEqual(['$5'])
  })
})

describe('extractCounts and numbersIn read a count as one value', () => {
  it('applies a magnitude word, so "12 mil" is never twelve', () => {
    expect(extractCounts('Gestioné una base de 12 mil clientes')).toEqual([12_000])
    expect(extractCounts('5 millones de usuarios')).toEqual([5_000_000])
    expect(extractCounts('1,5 millones de visitas')).toEqual([1_500_000])
    expect(extractCounts('12k seguidores, 3M impresiones')).toEqual([12_000, 3_000_000])
    expect(extractCounts('2 mil millones de impresiones')).toEqual([2_000_000_000])
    expect(numbersIn('Atendí a 12 clientes clave').has(12_000)).toBe(false)
    expect(numbersIn('una base de 12 mil clientes').has(12_000)).toBe(true)
  })

  it('a magnitude word is a whole word: "12 milestones" is twelve', () => {
    expect(extractCounts('12 milestones shipped')).toEqual([12])
  })

  it('reads a single Spanish thousands group as thousands', () => {
    expect(extractCounts('Más de 1.200 campañas')).toEqual([1200])
    expect(numbersIn('1,200 campaigns').has(1200)).toBe(true)
    expect(numbersIn('ROAS de 1.2x y $1.2M').has(1200)).toBe(false)
  })

  it('a credential id or a date part states no number', () => {
    const line = 'cert_3 | certification | Google Ads | 2023-05'
    expect(numbersIn(line).has(3)).toBe(false)
    expect(numbersIn(line).has(5)).toBe(false)
    expect(numbersIn('edu_1 obtained 05/2023').has(1)).toBe(false)
    expect(numbersIn('issued 2023-05-14').has(14)).toBe(false)
  })

  it('a source still states a digit fused to a name: "GA4" grounds "Google Analytics 4"', () => {
    expect(numbersIn('herramientas como GA4 y Hubspot').has(4)).toBe(true)
    expect(numbersIn('ev_2c46f5cb, exp_12').has(12)).toBe(false)
  })

  it('"once" is not eleven: the English adverb would ground any 11', () => {
    expect(numbersIn('Once the launch closed, sales rose').has(11)).toBe(false)
    expect(numbersIn('once campañas').has(11)).toBe(false)
    expect(numbersIn('11 campañas').has(11)).toBe(true)
  })

  it('still reads plain counts, percentages and spelled small numbers', () => {
    expect(extractCounts('a team of 6 and +200 clientes')).toEqual([6, 200])
    expect(numbersIn('subió 40% con tres campañas')).toEqual(new Set([40, 3]))
  })
})

describe('extractCounts with overlapping percentages', () => {
  // 2026-11-24, on an S25: a true screening answer ("a 2% por debajo … del
  // 3.1% al 4.2%") was flagged for a count of 4 that it never printed:
  // removing "2%" first had cut "4.2%" down to "4.".
  it('reads no count out of percentages that contain one another', () => {
    expect(
      extractCounts(
        'cerramos 2024 a 2% por debajo del presupuesto; la conversión subió del 3.1% al 4.2%.',
      ),
    ).toEqual([])
    expect(extractCounts('de 2% a 12% en un trimestre')).toEqual([])
    expect(extractCounts('un equipo de 6 y un ROAS de 2.1x a 12.1x')).toEqual([6])
  })
})
