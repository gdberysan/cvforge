import { describe, expect, it } from 'vitest'
import { stripUngroundedMetrics } from '@/lib/interview/ground'
import type { EvidenceItem } from '@/lib/schemas'

function ev(metrics: EvidenceItem['metrics']): EvidenceItem {
  return {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Rebuilt the checkout flow',
    metrics,
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  }
}

describe('stripUngroundedMetrics', () => {
  it('keeps a metric whose number appears in the answers', () => {
    const { evidence, dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }])],
      'We cut abandonment by 18% over the quarter.',
    )
    expect(evidence[0].metrics).toHaveLength(1)
    expect(dropped).toEqual([])
  })

  it('drops a metric the user never stated — the poisoning case', () => {
    const { evidence, dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'reduced latency 40%', value: 40, unit: '%', direction: 'down' }])],
      'It got a lot faster after the rewrite.',
    )
    expect(evidence[0].metrics).toHaveLength(0)
    expect(dropped[0]).toMatchObject({ evidenceId: 'ev_1', raw: 'reduced latency 40%' })
  })

  it('matches numbers written with separators or currency symbols', () => {
    const { evidence } = stripUngroundedMetrics(
      [ev([{ raw: '1200000 MXN monthly GMV', value: 1_200_000, unit: 'MXN', currency: 'MXN' }])],
      'We handled about $1,200,000 MXN in monthly GMV.',
    )
    expect(evidence[0].metrics).toHaveLength(1)
  })

  it('keeps a purely qualitative metric that carries no number', () => {
    const { evidence } = stripUngroundedMetrics(
      [ev([{ raw: 'owned the migration end to end' }])],
      'I owned the whole migration end to end.',
    )
    expect(evidence[0].metrics).toHaveLength(1)
  })

  it('leaves evidence text untouched — only metrics are filtered', () => {
    const { evidence } = stripUngroundedMetrics(
      [ev([{ raw: 'made it 99% faster', value: 99, unit: '%' }])],
      'no numbers here',
    )
    expect(evidence[0].text).toBe('Rebuilt the checkout flow')
  })

  it('drops a metric that inflates a number the user did state', () => {
    // The user said 18; the model wrote 80. Digits must actually match.
    const { evidence, dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'cut abandonment 80%', value: 80, unit: '%' }])],
      'Abandonment fell by 18%.',
    )
    expect(evidence[0].metrics).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it('does not let a year ground a number that merely shares its leading digits', () => {
    // "20" is a prefix of "2016", but the user never said 20%.
    const { evidence, dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'grew signups 20%', value: 20, unit: '%' }])],
      'I joined in 2016 and rebuilt the signup flow.',
    )
    expect(evidence[0].metrics).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it('does not accept a prefix of an unrelated figure as grounding', () => {
    // The user said 4018 requests; 40% is a different claim entirely.
    const { evidence, dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'made it 40% faster', value: 40, unit: '%' }])],
      'We were handling 4018 requests a second by the end.',
    )
    expect(evidence[0].metrics).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it('still accepts compact magnitude notation for a number the user spelled out', () => {
    // "1.2M" and "1,200,000" are the same quantity; only zeros may extend.
    const { evidence } = stripUngroundedMetrics(
      [ev([{ raw: '1.2M MXN monthly GMV', value: 1_200_000, unit: 'MXN', currency: 'MXN' }])],
      'Monthly GMV was about 1,200,000 pesos.',
    )
    expect(evidence[0].metrics).toHaveLength(1)
  })

  it('does not let a power of ten separate what was said from what is claimed', () => {
    // Zero-extension used to accept all of these; each is a fabricated figure.
    const cases: [string, string][] = [
      ['1.8%', 'cut abandonment 18%'],
      ['18%', 'cut abandonment 1.8%'],
      ['18%', 'grew revenue 180%'],
      ['2.5x', 'grew throughput 25%'],
      ['a team of 1', 'coverage 100%'],
      ['I joined in 2000', 'reduced churn 2%'],
    ]
    for (const [said, claimed] of cases) {
      const { dropped } = stripUngroundedMetrics([ev([{ raw: claimed }])], said)
      expect(
        dropped,
        `${JSON.stringify(said)} must not ground ${JSON.stringify(claimed)}`,
      ).toHaveLength(1)
    }
  })

  it('reads "mil" as a thousand, never as a million', () => {
    const { dropped } = stripUngroundedMetrics(
      [ev([{ raw: '$12M budget', value: 12_000_000, currency: 'MXN' }])],
      'Manejé un presupuesto de $12 mil pesos al mes.',
    )
    expect(dropped).toHaveLength(1)

    const kept = stripUngroundedMetrics(
      [ev([{ raw: '$12k budget', value: 12_000, currency: 'MXN' }])],
      'Manejé un presupuesto de $12 mil pesos al mes.',
    )
    expect(kept.dropped).toEqual([])
  })

  it('accepts the same quantity written with a magnitude word or spelled out', () => {
    const pairs: [string, string][] = [
      ['about 1.2 millones de pesos', '$1.2M MXN'],
      ['about 1,200,000 pesos', '1.2M MXN'],
      ['about 40k users', '40,000 users'],
      ['about 1.2M pesos', '1,200,000 MXN'],
    ]
    for (const [said, claimed] of pairs) {
      const { dropped } = stripUngroundedMetrics([ev([{ raw: claimed }])], said)
      expect(dropped, `${JSON.stringify(said)} should ground ${JSON.stringify(claimed)}`).toEqual(
        [],
      )
    }
  })

  it('accepts a decimal comma as the same number as a decimal point', () => {
    const { dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'ROAS 3.4x', value: 3.4, unit: 'x' }])],
      'Subí el ROAS a 3,4x en un trimestre.',
    )
    expect(dropped).toEqual([])
  })

  it('checks the stored value as well as the wording', () => {
    // The wording matches what was said; the structured value does not.
    const { dropped } = stripUngroundedMetrics(
      [ev([{ raw: 'cut abandonment 18%', value: 180, unit: '%' }])],
      'We cut abandonment by 18%.',
    )
    expect(dropped).toHaveLength(1)
  })
})
