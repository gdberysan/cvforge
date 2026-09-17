import { describe, expect, it } from 'vitest'
import {
  appliedAt,
  attentionApplications,
  bandPerformance,
  daysBetween,
  evidenceLeaderboard,
  gapRecurrence,
  respondedAt,
  type StatApp,
  sourcePerformance,
  staleApplications,
  velocity,
  waitingCount,
} from '@/lib/stats'

function app(over: Partial<StatApp> = {}): StatApp {
  return {
    id: 'app_1',
    source: 'linkedin',
    createdAt: '2026-08-01T00:00:00.000Z',
    archived: false,
    status: 'triaged',
    verdict: 'worth-it',
    outcomes: [],
    requirements: [],
    mappings: [],
    ...over,
  }
}

const applied = (at: string) => ({ at, type: 'applied' as const })
const screen = (at: string) => ({ at, type: 'screen' as const })

describe('appliedAt / respondedAt', () => {
  it('finds the first applied date and the first human response', () => {
    const a = app({
      outcomes: [applied('2026-08-02T00:00:00.000Z'), screen('2026-08-10T00:00:00.000Z')],
    })
    expect(appliedAt(a)).toBe('2026-08-02T00:00:00.000Z')
    expect(respondedAt(a)).toBe('2026-08-10T00:00:00.000Z')
  })

  it('a rejection alone is a decision, not traction — respondedAt stays null', () => {
    const a = app({
      outcomes: [
        applied('2026-08-02T00:00:00.000Z'),
        { at: '2026-08-09T00:00:00.000Z', type: 'rejected' },
      ],
    })
    expect(respondedAt(a)).toBeNull()
  })
})

describe('bandPerformance', () => {
  it('counts applied and responded per verdict band, with n', () => {
    const apps = [
      app({
        id: 'a',
        verdict: 'strong',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
      app({ id: 'b', verdict: 'strong', outcomes: [applied('2026-08-02T00:00:00.000Z')] }),
      app({ id: 'c', verdict: 'stretch', outcomes: [applied('2026-08-03T00:00:00.000Z')] }),
      app({ id: 'd', verdict: 'stretch', outcomes: [] }), // never applied: not in the denominator
    ]
    const bands = bandPerformance(apps)
    expect(bands.strong).toEqual({ applied: 2, responded: 1 })
    expect(bands.stretch).toEqual({ applied: 1, responded: 0 })
  })
})

describe('gapRecurrence', () => {
  it('ranks mandatory keywords that keep mapping to nothing', () => {
    const gapApp = (id: string, keyword: string) =>
      app({
        id,
        requirements: [
          {
            id: 'r1',
            text: keyword,
            keyword,
            variants: [],
            kind: 'hard',
            mandatory: true,
            weight: 3,
          },
        ],
        mappings: [{ requirementId: 'r1', evidenceIds: [], strength: 'none', rationale: '' }],
      })
    const gaps = gapRecurrence([
      gapApp('a', 'Google Ads'),
      gapApp('b', 'Google Ads'),
      gapApp('c', 'SQL'),
    ])
    expect(gaps[0]).toEqual({ keyword: 'Google Ads', count: 2 })
    expect(gaps[1]).toEqual({ keyword: 'SQL', count: 1 })
  })

  it('ignores desirable gaps — only mandatory misses can sink an application', () => {
    const a = app({
      requirements: [
        {
          id: 'r1',
          text: 'K8s',
          keyword: 'K8s',
          variants: [],
          kind: 'hard',
          mandatory: false,
          weight: 1,
        },
      ],
      mappings: [{ requirementId: 'r1', evidenceIds: [], strength: 'none', rationale: '' }],
    })
    expect(gapRecurrence([a])).toEqual([])
  })
})

describe('sourcePerformance', () => {
  it('reports response rate per source over applied applications only', () => {
    const apps = [
      app({
        id: 'a',
        source: 'linkedin',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-04T00:00:00.000Z')],
      }),
      app({ id: 'b', source: 'linkedin', outcomes: [applied('2026-08-02T00:00:00.000Z')] }),
      app({ id: 'c', source: 'occ', outcomes: [] }),
    ]
    const rows = sourcePerformance(apps)
    expect(rows).toEqual([{ source: 'linkedin', applied: 2, responded: 1 }])
  })
})

describe('evidenceLeaderboard', () => {
  it('credits evidence cited strongly in applications that got responses', () => {
    const a = app({
      id: 'a',
      outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-06T00:00:00.000Z')],
      mappings: [
        { requirementId: 'r1', evidenceIds: ['ev_1'], strength: 'strong', rationale: '' },
        { requirementId: 'r2', evidenceIds: ['ev_2'], strength: 'none', rationale: '' },
      ],
    })
    const b = app({
      id: 'b',
      outcomes: [applied('2026-08-02T00:00:00.000Z')],
      mappings: [{ requirementId: 'r1', evidenceIds: ['ev_1'], strength: 'strong', rationale: '' }],
    })
    const rows = evidenceLeaderboard([a, b])
    expect(rows[0]).toEqual({ evidenceId: 'ev_1', cited: 2, responded: 1 })
    // 'none' mappings never credit anything.
    expect(rows.find((r) => r.evidenceId === 'ev_2')).toBeUndefined()
  })

  it('keeps cited credential ids off the board when given the evidence ids', () => {
    // Mappings may cite cert_*/edu_*/lang_* ids. The board's labels come from
    // the evidence store, so a credential row renders as its raw id and
    // displaces a real evidence row.
    const a = app({
      id: 'a',
      outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-06T00:00:00.000Z')],
      mappings: [
        {
          requirementId: 'r1',
          evidenceIds: ['ev_1', 'lang_ingles'],
          strength: 'strong',
          rationale: '',
        },
      ],
    })
    const rows = evidenceLeaderboard([a], new Set(['ev_1']))
    expect(rows.map((r) => r.evidenceId)).toEqual(['ev_1'])
  })
})

describe('velocity and staleness', () => {
  const now = '2026-08-21T00:00:00.000Z'

  it('counts applications sent in the last seven days', () => {
    const apps = [
      app({ id: 'a', outcomes: [applied('2026-08-18T00:00:00.000Z')] }),
      app({ id: 'b', outcomes: [applied('2026-08-01T00:00:00.000Z')] }),
    ]
    expect(velocity(apps, now).appliedThisWeek).toBe(1)
  })

  it('computes the median days from applied to first response', () => {
    const apps = [
      app({
        id: 'a',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
      app({
        id: 'b',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-11T00:00:00.000Z')],
      }),
    ]
    expect(velocity(apps, now).medianResponseDays).toBe(7)
  })

  it('reports null median with no responses — never a made-up number', () => {
    expect(velocity([app()], now).medianResponseDays).toBeNull()
  })

  it('counts the previous week separately, for the week-over-week note', () => {
    const apps = [
      app({ id: 'a', outcomes: [applied('2026-08-18T00:00:00.000Z')] }), // 3d ago
      app({ id: 'b', outcomes: [applied('2026-08-10T00:00:00.000Z')] }), // 11d ago
      app({ id: 'c', outcomes: [applied('2026-08-01T00:00:00.000Z')] }), // 20d ago
    ]
    const v = velocity(apps, now)
    expect(v.appliedThisWeek).toBe(1)
    expect(v.appliedPrevWeek).toBe(1)
  })

  it('reports how many responses the median rests on', () => {
    const apps = [
      app({
        id: 'a',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
      app({
        id: 'b',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-11T00:00:00.000Z')],
      }),
      app({ id: 'c', outcomes: [applied('2026-08-02T00:00:00.000Z')] }),
    ]
    expect(velocity(apps, now).timedResponses).toBe(2)
    expect(velocity([app()], now).timedResponses).toBe(0)
  })

  it('flags applied applications past the stale threshold, ignoring settled ones', () => {
    const apps = [
      app({ id: 'old', outcomes: [applied('2026-08-01T00:00:00.000Z')] }),
      app({ id: 'fresh', outcomes: [applied('2026-08-19T00:00:00.000Z')] }),
      app({
        id: 'settled',
        outcomes: [
          applied('2026-08-01T00:00:00.000Z'),
          { at: '2026-08-03T00:00:00.000Z', type: 'rejected' as const },
        ],
      }),
    ]
    const stale = staleApplications(apps, now)
    expect(stale.map((s) => s.id)).toEqual(['old'])
    expect(stale[0].daysSinceApplied).toBe(20)
  })
})

describe('daysBetween', () => {
  it('floors, so an application 6d13h old still counts as within this week', () => {
    expect(daysBetween('2026-08-18T20:00:00.000Z', '2026-08-25T09:00:00.000Z')).toBe(6)
  })
})

describe('attentionApplications', () => {
  const now = '2026-08-21T00:00:00.000Z'

  it('lists stale silence first (oldest on top), then unsent drafts (oldest first)', () => {
    const apps = [
      app({ id: 'stale-old', outcomes: [applied('2026-08-01T00:00:00.000Z')] }),
      app({ id: 'stale-new', outcomes: [applied('2026-08-05T00:00:00.000Z')] }),
      app({ id: 'draft-new', status: 'drafting', createdAt: '2026-08-10T00:00:00.000Z' }),
      app({ id: 'draft-old', status: 'drafting', createdAt: '2026-08-02T00:00:00.000Z' }),
      app({
        id: 'answered',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-03T00:00:00.000Z')],
      }),
      app({ id: 'just-triaged' }),
    ]
    const items = attentionApplications(apps, now)
    expect(items.map((i) => i.id)).toEqual(['stale-old', 'stale-new', 'draft-old', 'draft-new'])
    expect(items[0]).toEqual({ id: 'stale-old', reason: 'stale', daysSinceApplied: 20 })
    expect(items[2]).toEqual({ id: 'draft-old', reason: 'unsent' })
  })

  it('never lists the same application twice — stale wins over its status', () => {
    const a = app({
      id: 'both',
      status: 'drafting',
      outcomes: [applied('2026-08-01T00:00:00.000Z')],
    })
    expect(attentionApplications([a], now).map((i) => i.reason)).toEqual(['stale'])
  })
})

describe('waitingCount', () => {
  it('counts sent applications still waiting on a human — no response, not settled', () => {
    const apps = [
      app({ id: 'waiting', outcomes: [applied('2026-08-01T00:00:00.000Z')] }),
      app({
        id: 'answered',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
      app({
        id: 'settled',
        outcomes: [
          applied('2026-08-01T00:00:00.000Z'),
          { at: '2026-08-03T00:00:00.000Z', type: 'rejected' as const },
        ],
      }),
      app({ id: 'unsent', outcomes: [] }),
    ]
    expect(waitingCount(apps)).toBe(1)
  })
})

describe('gapRecurrence with no mapping row at all', () => {
  it('counts an unmapped mandatory requirement as a gap, not as covered', () => {
    const a = app({
      requirements: [
        {
          id: 'r1',
          text: 'Kubernetes',
          keyword: 'Kubernetes',
          variants: [],
          kind: 'hard',
          mandatory: true,
          weight: 3,
        },
      ],
      mappings: [], // no row — the mapper never saw it
    })
    expect(gapRecurrence([a])).toEqual([{ keyword: 'Kubernetes', count: 1 }])
  })
})
