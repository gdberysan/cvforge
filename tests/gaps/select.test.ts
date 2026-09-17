import { describe, expect, it } from 'vitest'
import { selectGaps } from '@/lib/gaps/select'
import type { EvidenceMapping, Requirement } from '@/lib/schemas'

function req(over: Partial<Requirement> & { id: string }): Requirement {
  return {
    text: 'Some requirement',
    keyword: 'Thing',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
    ...over,
  }
}

const map = (
  id: string,
  strength: EvidenceMapping['strength'],
  rationale = '',
): EvidenceMapping => ({ requirementId: id, evidenceIds: [], strength, rationale })

describe('selectGaps', () => {
  it('puts an unmet mandatory skill in the primary list with the mapper reasoning', () => {
    const requirements = [req({ id: 'req_1', keyword: 'Salesforce' })]
    const mappings = [map('req_1', 'none', 'Nothing in your evidence mentions Salesforce.')]

    const { primary, secondary, blockers } = selectGaps(requirements, mappings)

    expect(primary).toEqual([
      {
        requirement: requirements[0],
        rationale: 'Nothing in your evidence mentions Salesforce.',
        strength: 'none',
      },
    ])
    expect(secondary).toEqual([])
    expect(blockers).toEqual([])
  })

  it('never offers a location, timezone or authorization requirement to write against', () => {
    const requirements = [
      req({ id: 'req_1', kind: 'location', keyword: 'Mexico City' }),
      req({ id: 'req_2', kind: 'timezone', keyword: 'CET overlap' }),
      req({ id: 'req_3', kind: 'authorization', keyword: 'EU work permit' }),
    ]
    const mappings = requirements.map((r) => map(r.id, 'none'))

    const { primary, secondary, blockers } = selectGaps(requirements, mappings)

    expect(primary).toEqual([])
    expect(secondary).toEqual([])
    expect(blockers.map((b) => b.id)).toEqual(['req_1', 'req_2', 'req_3'])
  })

  it('blocks only what the verdict blocks: an unmet gating requirement that is mandatory', () => {
    // A "nice to have: based in CDMX" beside real mandatory requirements does
    // not gate the verdict, so the gaps page must not tell the user to fix it.
    const requirements = [
      req({ id: 'req_1', kind: 'location', keyword: 'CDMX', mandatory: false }),
      req({ id: 'req_2', keyword: 'SQL' }),
    ]
    const { blockers, secondary } = selectGaps(requirements, [
      map('req_1', 'none'),
      map('req_2', 'partial'),
    ])
    expect(blockers).toEqual([])
    expect(secondary.map((g) => g.requirement.id)).toEqual(['req_2'])

    // A partial location is not writable and not blocking either.
    expect(selectGaps([req({ id: 'req_1', kind: 'location' })], [map('req_1', 'partial')])).toEqual(
      { primary: [], secondary: [], blockers: [] },
    )

    // With nothing flagged mandatory, the flag is not trustworthy and an
    // unmet gating requirement blocks — the same rule computeCoverage applies.
    const { blockers: gated } = selectGaps(
      [req({ id: 'req_1', kind: 'location', mandatory: false })],
      [map('req_1', 'none')],
    )
    expect(gated.map((b) => b.id)).toEqual(['req_1'])
  })

  it('keeps a satisfied gating requirement out of the blockers', () => {
    const requirements = [req({ id: 'req_1', kind: 'timezone' })]
    const { blockers } = selectGaps(requirements, [map('req_1', 'strong')])
    expect(blockers).toEqual([])
  })

  it('offers partials and non-mandatory misses as secondary, in requirement order', () => {
    const requirements = [
      req({ id: 'req_1', keyword: 'Airflow', mandatory: true }),
      req({ id: 'req_2', keyword: 'dbt', mandatory: false }),
      req({ id: 'req_3', keyword: 'SQL', mandatory: true }),
    ]
    const mappings = [map('req_1', 'partial'), map('req_2', 'none'), map('req_3', 'none')]

    const { primary, secondary } = selectGaps(requirements, mappings)

    expect(primary.map((g) => g.requirement.id)).toEqual(['req_3'])
    expect(secondary.map((g) => g.requirement.id)).toEqual(['req_1', 'req_2'])
    expect(secondary[0].strength).toBe('partial')
  })

  it('treats a requirement with no mapping row at all as an unmet gap', () => {
    const requirements = [req({ id: 'req_1' })]
    const { primary } = selectGaps(requirements, [])
    expect(primary).toHaveLength(1)
    expect(primary[0].strength).toBe('none')
    expect(primary[0].rationale).toBe('')
  })

  it('leaves a fully covered requirement out of every list', () => {
    const requirements = [req({ id: 'req_1' })]
    const { primary, secondary, blockers } = selectGaps(requirements, [map('req_1', 'strong')])
    expect([...primary, ...secondary, ...blockers]).toEqual([])
  })
})
