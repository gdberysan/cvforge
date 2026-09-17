import { describe, expect, it } from 'vitest'
import { extractQuantities, normaliseQuantity } from '@/lib/verify/quantities'

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
