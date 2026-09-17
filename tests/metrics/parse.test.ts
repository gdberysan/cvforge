import { describe, expect, it } from 'vitest'
import { parseMetric } from '@/lib/metrics/parse'

describe('parseMetric', () => {
  it('reads a percentage and infers a downward direction from the verb', () => {
    expect(parseMetric('cut checkout abandonment 18%')).toMatchObject({
      value: 18,
      unit: '%',
      direction: 'down',
    })
  })

  it('infers an upward direction from a growth verb', () => {
    expect(parseMetric('grew monthly revenue 34%')).toMatchObject({
      value: 34,
      unit: '%',
      direction: 'up',
    })
  })

  it('reads a multiplier', () => {
    expect(parseMetric('tripled throughput 3x')).toMatchObject({ value: 3, unit: 'x' })
  })

  it('expands a magnitude suffix', () => {
    expect(parseMetric('removed 1.4M MXN per year in licensing')).toMatchObject({
      value: 1_400_000,
      unit: 'MXN',
      currency: 'MXN',
    })
  })

  it('expands a thousands suffix', () => {
    expect(parseMetric('handled 250k orders')).toMatchObject({ value: 250_000 })
  })

  it('flags a bare currency symbol as ambiguous rather than guessing', () => {
    const parsed = parseMetric('managed a $1.2M budget')
    expect(parsed.value).toBe(1_200_000)
    expect(parsed.needsCurrency).toBe(true)
    expect(parsed.currency).toBeUndefined()
  })

  it('does not flag ambiguity when the code is explicit', () => {
    expect(parseMetric('drove 1.2M USD in GMV')).toMatchObject({
      value: 1_200_000,
      currency: 'USD',
      needsCurrency: false,
    })
  })

  it('reads a compound rate unit', () => {
    expect(parseMetric('cut manual work 12 hours per week')).toMatchObject({
      value: 12,
      unit: 'hours/week',
      direction: 'down',
    })
  })

  it('reads a plain counted unit', () => {
    expect(parseMetric('led a team of 6 engineers')).toMatchObject({ value: 6, unit: 'engineers' })
  })

  it('returns nothing parseable for text with no number', () => {
    expect(parseMetric('owned the migration end to end')).toEqual({ needsCurrency: false })
  })

  it('ignores a four-digit year so dates are not read as metrics', () => {
    expect(parseMetric('led the 2018 replatform')).toEqual({ needsCurrency: false })
  })

  it('takes the first number when several appear', () => {
    expect(parseMetric('cut 18% across 3 regions')).toMatchObject({ value: 18, unit: '%' })
  })

  it('does not read a digit glued to an identifier as the quantity', () => {
    // "p95" is a percentile name, not the metric. The number is 40.
    expect(parseMetric('reduced p95 latency 40%')).toMatchObject({
      value: 40,
      unit: '%',
      direction: 'down',
    })
  })

  it('does not let a currency code elsewhere in the text claim the first number', () => {
    const parsed = parseMetric('cut costs 30% saving $5,000 MXN')
    expect(parsed).toMatchObject({ value: 30, unit: '%' })
    expect(parsed.currency).toBeUndefined()
  })

  it('applies a currency code written before the amount', () => {
    expect(parseMetric('managed a MXN 1.2M budget')).toMatchObject({
      value: 1_200_000,
      currency: 'MXN',
      needsCurrency: false,
    })
  })

  it('reads a year-sized amount of money as money, not a date', () => {
    expect(parseMetric('saved $2000 a month')).toMatchObject({ value: 2000, needsCurrency: true })
    expect(parseMetric('ahorré 2000 MXN al mes')).toMatchObject({ value: 2000, currency: 'MXN' })
  })

  it('reads a year-sized quantity when a unit makes it a quantity', () => {
    expect(parseMetric('saved 2000 hours per year')).toMatchObject({
      value: 2000,
      unit: 'hours/year',
      direction: 'down',
    })
  })
})

describe('Spanish decimal commas', () => {
  it('reads 1,5M as one and a half million, not fifteen million', () => {
    expect(parseMetric('aumenté ingresos 1,5M MXN').value).toBe(1_500_000)
  })

  it('reads 12,5% as twelve and a half percent', () => {
    const m = parseMetric('mejoré conversión 12,5%')
    expect(m.value).toBe(12.5)
    expect(m.unit).toBe('%')
  })

  it('still reads comma-grouped thousands correctly', () => {
    expect(parseMetric('procesé 1,500 órdenes').value).toBe(1500)
    expect(parseMetric('gestioné 1,500,000 MXN').value).toBe(1_500_000)
  })
})

describe('Spanish rate articles', () => {
  it('skips the article so "horas a la semana" reads horas/semana', () => {
    expect(parseMetric('ahorré 12 horas a la semana').unit).toBe('horas/semana')
  })

  it('still reads bare rates', () => {
    expect(parseMetric('saved 12 hours per week').unit).toBe('hours/week')
  })
})
