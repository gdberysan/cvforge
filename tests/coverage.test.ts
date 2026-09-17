import { describe, expect, it } from 'vitest'
import { computeCoverage } from '@/lib/coverage'
import type { EvidenceMapping, Requirement } from '@/lib/schemas'

function req(id: string, over: Partial<Requirement> = {}): Requirement {
  return {
    id,
    text: id,
    keyword: id,
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 2,
    ...over,
  }
}

function map(requirementId: string, strength: EvidenceMapping['strength']): EvidenceMapping {
  return {
    requirementId,
    evidenceIds: strength === 'none' ? [] : ['ev_1'],
    strength,
    rationale: '',
  }
}

describe('computeCoverage', () => {
  it('counts mandatory and desirable requirements separately', () => {
    const requirements = [req('r1'), req('r2'), req('r3', { mandatory: false })]
    const c = computeCoverage(requirements, [
      map('r1', 'strong'),
      map('r2', 'partial'),
      map('r3', 'strong'),
    ])

    expect(c.mandatoryTotal).toBe(2)
    expect(c.mandatoryStrong).toBe(1)
    expect(c.mandatoryPartial).toBe(1)
    expect(c.desirableTotal).toBe(1)
    expect(c.desirableStrong).toBe(1)
  })

  it('returns skip and lists the blocker when a gating requirement is unmet', () => {
    const requirements = [
      req('r1', { kind: 'location', text: 'Must be EU-based' }),
      ...Array.from({ length: 9 }, (_, i) => req(`r${i + 2}`)),
    ]
    const mappings = [
      map('r1', 'none'),
      ...Array.from({ length: 9 }, (_, i) => map(`r${i + 2}`, 'strong')),
    ]
    const c = computeCoverage(requirements, mappings)

    expect(c.verdict).toBe('skip')
    expect(c.hardBlockers).toHaveLength(1)
    expect(c.hardBlockers[0].text).toBe('Must be EU-based')
  })

  it('does not treat a satisfied gating requirement as a blocker', () => {
    const c = computeCoverage(
      [req('r1', { kind: 'timezone' }), req('r2')],
      [map('r1', 'strong'), map('r2', 'strong')],
    )
    expect(c.hardBlockers).toHaveLength(0)
    expect(c.verdict).toBe('strong')
  })

  it('does not treat a non-mandatory gating requirement as a blocker', () => {
    const c = computeCoverage(
      [req('r1', { kind: 'location', mandatory: false }), req('r2')],
      [map('r1', 'none'), map('r2', 'strong')],
    )
    expect(c.hardBlockers).toHaveLength(0)
  })

  it('returns strong at 80% mandatory strong coverage', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`))
    const mappings = requirements.map((r, i) => map(r.id, i < 8 ? 'strong' : 'partial'))
    expect(computeCoverage(requirements, mappings).verdict).toBe('strong')
  })

  it('returns worth-it when combined coverage clears 70% with at most two misses', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`))
    const mappings = requirements.map((r, i) =>
      map(r.id, i < 5 ? 'strong' : i < 8 ? 'partial' : 'none'),
    )
    expect(computeCoverage(requirements, mappings).verdict).toBe('worth-it')
  })

  it('returns stretch when misses are between three and four', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`))
    const mappings = requirements.map((r, i) => map(r.id, i < 6 ? 'strong' : 'none'))
    expect(computeCoverage(requirements, mappings).verdict).toBe('stretch')
  })

  /**
   * `skip` used to have two meanings — "you are disqualified" and "this is a
   * long shot" — and the second one rode on a count that two identical eval
   * runs disagreed about (2026-09-05: missing 4 vs 7 on the same posting, same
   * evidence). A coin-flip must not tell someone not to apply, so a shortfall
   * bottoms out at `stretch` and `skip` is reserved for a real gate.
   */
  it('returns stretch, not skip, when the shortfall is large but nothing gates it', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`))
    const mappings = requirements.map((r, i) => map(r.id, i < 5 ? 'strong' : 'none'))
    expect(computeCoverage(requirements, mappings).verdict).toBe('stretch')
  })

  it('returns stretch even when every mandatory requirement is missing', () => {
    const requirements = Array.from({ length: 8 }, (_, i) => req(`r${i}`))
    const mappings = requirements.map((r) => map(r.id, 'none'))
    const c = computeCoverage(requirements, mappings)
    expect(c.verdict).toBe('stretch')
    expect(c.mandatoryMissing).toBe(8)
  })

  it('still returns skip for a gating requirement no matter how good the rest is', () => {
    const requirements = [
      req('r1', { kind: 'location' }),
      ...Array.from({ length: 9 }, (_, i) => req(`r${i + 2}`)),
    ]
    const mappings = requirements.map((r) => map(r.id, r.id === 'r1' ? 'none' : 'strong'))
    expect(computeCoverage(requirements, mappings).verdict).toBe('skip')
  })

  /**
   * CHANGED from the pre-fix suite, which asserted 'worth-it' here
   * unconditionally whenever mandatoryTotal was 0 — the exact bug this file
   * fixes. This single desirable requirement is entirely unmet (0/1
   * combined coverage), so judged on the pool that actually exists it must
   * land on 'stretch', the same way a real posting with a 0% desirable hit
   * rate would. This is strictly a stricter output than before for this
   * input (worth-it -> stretch), never more generous, so it does not
   * violate the "never soften decideVerdict" rule — it removes an
   * accidental softening.
   */
  it('returns stretch when a posting states no mandatory requirements and the lone desirable one is missed', () => {
    const c = computeCoverage([req('r1', { mandatory: false })], [map('r1', 'none')])
    expect(c.mandatoryTotal).toBe(0)
    expect(c.verdict).toBe('stretch')
  })

  it('treats a requirement with no mapping as missing rather than throwing', () => {
    expect(computeCoverage([req('r1')], []).mandatoryMissing).toBe(1)
  })

  /**
   * The real defect: an HP "Marketing Automation Engineer" posting came back
   * with 0/24 requirements marked mandatory — an extraction failure, not a
   * permissive employer (real postings mark 58%-94% mandatory). The user
   * matched 6 strongly, 8 partially, missed 10 out of the 24 that WERE
   * extracted. Judging that on the desirable pool: combined coverage is
   * (6+8)/24 = 0.583 (< 0.7) and 10 missing is well past the <=2 bound, so
   * this must be 'stretch', not the 'worth-it' the old short-circuit handed
   * out just because nothing happened to be flagged mandatory.
   */
  it('returns stretch for the real HP shape: 0 mandatory, 24 desirable, 6 strong / 8 partial / 10 missing', () => {
    const requirements = [
      ...Array.from({ length: 6 }, (_, i) => req(`strong${i}`, { mandatory: false })),
      ...Array.from({ length: 8 }, (_, i) => req(`partial${i}`, { mandatory: false })),
      ...Array.from({ length: 10 }, (_, i) => req(`missing${i}`, { mandatory: false })),
    ]
    const mappings = [
      ...Array.from({ length: 6 }, (_, i) => map(`strong${i}`, 'strong')),
      ...Array.from({ length: 8 }, (_, i) => map(`partial${i}`, 'partial')),
      ...Array.from({ length: 10 }, (_, i) => map(`missing${i}`, 'none')),
    ]
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableTotal).toBe(24)
    expect(c.verdict).toBe('stretch')
  })

  /**
   * Do not overcorrect into always-stretch: when nothing is mandatory but
   * the desirable requirements that WERE extracted are covered well, this
   * must still reach a good verdict. It is capped at 'worth-it' rather than
   * 'strong' on purpose — the pre-fix function guaranteed 'worth-it' (never
   * better) for every 0-mandatory posting regardless of desirable coverage,
   * and the "never more generous than before" rule means this path may only
   * get stricter than that ceiling, never exceed it.
   */
  it('returns worth-it when 0 mandatory but desirable coverage is strong', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`, { mandatory: false }))
    const mappings = requirements.map((r, i) => map(r.id, i < 9 ? 'strong' : 'partial'))
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.verdict).toBe('worth-it')
  })

  /**
   * FIX ROUND 1, finding 2: genuinely nothing extracted (no mandatory AND no
   * desirable requirements at all) is a MORE complete extraction failure
   * than the 0-of-24 HP case, not a milder one — "nothing is stated, so
   * nothing can disqualify you" is exactly the false premise this whole
   * rewrite exists to remove, and it must not survive as the one remaining
   * path to a good verdict on zero evidence of fit. CHANGED from the
   * fix-round-0 expectation of 'worth-it' for this reason.
   */
  it('returns stretch when literally no requirements were extracted at all', () => {
    const c = computeCoverage([], [])
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableTotal).toBe(0)
    expect(c.verdict).toBe('stretch')
  })

  /**
   * FIX ROUND 1, finding 1: when nothing at all got flagged mandatory, that
   * flag is not trustworthy — the same extraction failure the whole rewrite
   * exists to handle — so a gating requirement (location/timezone/
   * authorization) sitting in the desirable pool must still gate. Judging
   * the soft counts anyway while treating gating as inert would still let
   * an ineligible posting read 'worth-it': 9 strong + 1 unmet location out
   * of 10 gives combinedRatio 0.9 and 1 missing, comfortably inside the
   * worth-it thresholds.
   */
  it('returns skip for an unmet gating requirement in the desirable pool when nothing is flagged mandatory', () => {
    const requirements = [
      req('r1', { kind: 'location', mandatory: false, text: 'Must be EU-based' }),
      ...Array.from({ length: 9 }, (_, i) => req(`r${i + 2}`, { mandatory: false })),
    ]
    const mappings = [
      map('r1', 'none'),
      ...Array.from({ length: 9 }, (_, i) => map(`r${i + 2}`, 'strong')),
    ]
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.verdict).toBe('skip')
    expect(c.hardBlockers).toHaveLength(1)
    expect(c.hardBlockers[0].text).toBe('Must be EU-based')
  })

  /**
   * FIX ROUND 1, finding 3(a): pins `desirableMissing <= 2`. Combined ratio
   * alone (17/20 = 0.85) clears 0.7, so without the missing bound this would
   * wrongly read 'worth-it' despite 3 unmet requirements.
   */
  it('returns stretch when desirable ratio clears 0.7 but more than two are missing', () => {
    const requirements = Array.from({ length: 20 }, (_, i) => req(`r${i}`, { mandatory: false }))
    const mappings = requirements.map((r, i) => map(r.id, i < 17 ? 'strong' : 'none'))
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableMissing).toBe(3)
    expect(c.verdict).toBe('stretch')
  })

  /**
   * FIX ROUND 1, finding 3: a pair straddling the 0.7 combined-ratio
   * threshold, both with missing <= 2 so only the ratio is under test.
   * 4/6 = 0.667 sits inside (0.584, 0.7) — the exact window a loosened
   * threshold (e.g. >= 0.6) would wrongly wave through, since the HP
   * fixture's own ratio (0.583) is just below it.
   */
  it('returns stretch just below the 0.7 desirable-ratio threshold', () => {
    const requirements = Array.from({ length: 6 }, (_, i) => req(`r${i}`, { mandatory: false }))
    const mappings = requirements.map((r, i) => map(r.id, i < 4 ? 'strong' : 'none'))
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableMissing).toBe(2)
    expect(c.verdict).toBe('stretch')
  })

  it('returns worth-it just at/above the 0.7 desirable-ratio threshold', () => {
    const requirements = Array.from({ length: 8 }, (_, i) => req(`r${i}`, { mandatory: false }))
    const mappings = requirements.map((r, i) => map(r.id, i < 6 ? 'strong' : 'none'))
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableMissing).toBe(2)
    expect(c.verdict).toBe('worth-it')
  })

  /**
   * FIX ROUND 1, finding 3(c): pins that partial credit, not just strong
   * credit, counts toward the desirable ratio. 0 strong / 8 partial / 2
   * missing gives combinedRatio (0+8)/10 = 0.8 (worth-it), but a strong-only
   * numerator would read 0/10 = 0 (stretch). The pre-existing "0 mandatory,
   * strong desirable coverage" test doesn't catch this because it uses 9
   * strong / 1 partial, where strong alone already clears 0.7.
   */
  it('counts partial desirable matches toward the combined ratio, not just strong', () => {
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`, { mandatory: false }))
    const mappings = requirements.map((r, i) => map(r.id, i < 8 ? 'partial' : 'none'))
    const c = computeCoverage(requirements, mappings)
    expect(c.mandatoryTotal).toBe(0)
    expect(c.desirableStrong).toBe(0)
    expect(c.desirablePartial).toBe(8)
    expect(c.desirableMissing).toBe(2)
    expect(c.verdict).toBe('worth-it')
  })
})
