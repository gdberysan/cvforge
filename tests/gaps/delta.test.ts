import { describe, expect, it } from 'vitest'
import { computeDelta, type Snapshot, SnapshotSchema, takeSnapshot } from '@/lib/gaps/delta'
import type { Coverage, Requirement } from '@/lib/schemas'

const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'Salesforce',
    keyword: 'Salesforce',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
  },
  {
    id: 'req_2',
    text: 'Airflow',
    keyword: 'Airflow',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
  },
]

const snap = (verdict: Snapshot['verdict'], strengths: Snapshot['strengths']): Snapshot => ({
  verdict,
  strengths,
})

describe('takeSnapshot', () => {
  it('reads the verdict and every mapped strength off the stored application', () => {
    const coverage = { verdict: 'stretch' } as Coverage
    const result = takeSnapshot({
      coverage,
      mappings: [
        { requirementId: 'req_1', evidenceIds: [], strength: 'none', rationale: '' },
        { requirementId: 'req_2', evidenceIds: ['ev_1'], strength: 'partial', rationale: '' },
      ],
    })
    expect(result).toEqual({ verdict: 'stretch', strengths: { req_1: 'none', req_2: 'partial' } })
  })
})

describe('SnapshotSchema', () => {
  it('accepts a snapshot that made the round trip through a URL', () => {
    const before = snap('stretch', { req_1: 'none' })
    const parsed = SnapshotSchema.safeParse(JSON.parse(JSON.stringify(before)))
    expect(parsed.success).toBe(true)
  })

  it('rejects a hand-edited verdict rather than rendering it', () => {
    expect(SnapshotSchema.safeParse({ verdict: 'amazing', strengths: {} }).success).toBe(false)
  })
})

describe('computeDelta', () => {
  it('reports a requirement that gained evidence, with its keyword', () => {
    const delta = computeDelta(
      snap('stretch', { req_1: 'none', req_2: 'none' }),
      snap('worth-it', { req_1: 'strong', req_2: 'none' }),
      requirements,
    )

    expect(delta.moves).toEqual([
      { requirementId: 'req_1', keyword: 'Salesforce', before: 'none', after: 'strong' },
    ])
    expect(delta.verdictBefore).toBe('stretch')
    expect(delta.verdictAfter).toBe('worth-it')
    expect(delta.verdictChanged).toBe(true)
  })

  it('reports a partial move as partial rather than rounding it up', () => {
    const delta = computeDelta(
      snap('stretch', { req_1: 'none' }),
      snap('stretch', { req_1: 'partial' }),
      requirements,
    )
    expect(delta.moves[0].after).toBe('partial')
    expect(delta.verdictChanged).toBe(false)
  })

  it('reports nothing moved when nothing moved', () => {
    const delta = computeDelta(
      snap('skip', { req_1: 'none' }),
      snap('skip', { req_1: 'none' }),
      requirements,
    )
    expect(delta.moves).toEqual([])
    expect(delta.verdictChanged).toBe(false)
  })

  it('reports a requirement that lost ground instead of hiding it', () => {
    const delta = computeDelta(
      snap('worth-it', { req_1: 'strong' }),
      snap('stretch', { req_1: 'partial' }),
      requirements,
    )
    expect(delta.moves).toEqual([
      { requirementId: 'req_1', keyword: 'Salesforce', before: 'strong', after: 'partial' },
    ])
  })

  it('treats a requirement missing from a snapshot as none', () => {
    const delta = computeDelta(snap('skip', {}), snap('skip', { req_2: 'strong' }), requirements)
    expect(delta.moves).toEqual([
      { requirementId: 'req_2', keyword: 'Airflow', before: 'none', after: 'strong' },
    ])
  })
})
