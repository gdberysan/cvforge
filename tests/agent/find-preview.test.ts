import { describe, expect, it } from 'vitest'
import { findPreview } from '@/lib/agent/find-preview'
import { computeCoverage } from '@/lib/coverage'
import type { EvidenceMapping, Requirement } from '@/lib/schemas'

const req = (id: string, keyword: string, over: Partial<Requirement> = {}): Requirement => ({
  id,
  text: `${keyword}, please`,
  keyword,
  variants: [],
  kind: 'hard',
  mandatory: true,
  weight: 2,
  ...over,
})
const map = (
  requirementId: string,
  strength: EvidenceMapping['strength'],
  over: Partial<EvidenceMapping> = {},
): EvidenceMapping => ({ requirementId, evidenceIds: [], strength, rationale: 'r', ...over })

/** The stored analysis as the agent writes it: coverage computed from the same rows. */
function analysis(requirements: Requirement[], mappings: EvidenceMapping[]) {
  return { requirements, mappings, coverage: computeCoverage(requirements, mappings) }
}

const kw = (p: ReturnType<typeof findPreview>, tone: string) =>
  p.groups.find((g) => g.tone === tone)?.rows.map((r) => r.keyword) ?? []

describe('findPreview', () => {
  const reqs = [
    req('r1', 'Google Ads'),
    req('r2', 'Meta Ads'),
    req('r3', 'SQL'),
    req('r4', 'GA4'),
    req('r5', 'Tableau', { mandatory: false }),
    req('r6', 'Looker', { mandatory: false }),
    req('r7', 'Presupuestos'),
  ]
  const maps = [
    map('r1', 'strong'),
    map('r2', 'strong'),
    map('r3', 'none'),
    map('r4', 'partial'),
    map('r5', 'strong'),
    map('r6', 'none'),
    map('r7', 'none', { unjudged: true }),
  ]
  const a = analysis(reqs, maps)
  const p = findPreview(a)

  it('shows mandatory requirements only — a desirable one never appears', () => {
    const all = p.groups.flatMap((g) => g.rows.map((r) => r.keyword))
    expect(all.sort()).toEqual(['GA4', 'Google Ads', 'Meta Ads', 'Presupuestos', 'SQL'])
    expect(all).not.toContain('Tableau')
    expect(all).not.toContain('Looker')
  })

  it('an unjudged mapping is shown as unjudged, not as missing', () => {
    expect(kw(p, 'unjudged')).toEqual(['Presupuestos'])
    expect(kw(p, 'missing')).toEqual(['SQL'])
    expect(kw(p, 'partial')).toEqual(['GA4'])
  })

  it('Cubres equals the stored coverage and the card\'s "X de Y"', () => {
    expect(kw(p, 'strong')).toHaveLength(a.coverage.mandatoryStrong)
    expect(p.strong).toBe(a.coverage.mandatoryStrong)
    expect(p.strong).toBe(2)
    // Y counts every mandatory requirement, the same set the groups hold.
    expect(p.total).toBe(a.coverage.mandatoryTotal)
    expect(p.groups.reduce((n, g) => n + g.rows.length, 0)).toBe(p.total)
  })

  it('a hard blocker leads what is missing', () => {
    const b = analysis(
      [req('a', 'SQL'), req('b', 'CDMX', { kind: 'location' }), req('c', 'Ads')],
      [map('a', 'none'), map('b', 'none'), map('c', 'strong')],
    )
    const missing = findPreview(b).groups.find((g) => g.tone === 'missing')?.rows ?? []
    expect(missing.map((r) => [r.keyword, r.blocker])).toEqual([
      ['CDMX', true],
      ['SQL', false],
    ])
  })

  it('sends keywords and judgements only — no requirement text or rationale', () => {
    const json = JSON.stringify(p)
    expect(json).not.toMatch('please')
    expect(json).not.toMatch('rationale')
  })

  it('an older row missing its lists reads as nothing judged', () => {
    const empty = findPreview({
      // biome-ignore lint/suspicious/noExplicitAny: an older satellite row without these fields
      requirements: undefined as any,
      // biome-ignore lint/suspicious/noExplicitAny: same
      mappings: undefined as any,
      coverage: computeCoverage([], []),
    })
    expect(empty).toEqual({ strong: 0, total: 0, groups: [] })
  })
})
