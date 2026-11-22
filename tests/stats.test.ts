import { describe, expect, it } from 'vitest'
import {
  appliedAt,
  attentionApplications,
  bandPerformance,
  daysBetween,
  evidenceLeaderboard,
  gapRecurrence,
  respondedAt,
  responseRateSeries,
  type StatApp,
  sourcePerformance,
  staleApplications,
  staleDays,
  velocity,
  waitingCount,
  weeklySent,
} from '@/lib/stats'
import { calendarDaysSince } from '@/lib/time'

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

  it('lists every reply time behind the median, shortest first', () => {
    const apps = [
      app({
        id: 'a',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-11T00:00:00.000Z')],
      }),
      app({
        id: 'b',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
    ]
    expect(velocity(apps, now).responseDays).toEqual([4, 10])
  })

  it('counts sends per week, oldest first, this week last, ignoring future dates', () => {
    const apps = [
      app({ id: 'a', outcomes: [applied('2026-08-20T00:00:00.000Z')] }),
      app({ id: 'b', outcomes: [applied('2026-08-19T00:00:00.000Z')] }),
      app({ id: 'c', outcomes: [applied('2026-08-10T00:00:00.000Z')] }),
      app({ id: 'd', outcomes: [applied('2026-05-01T00:00:00.000Z')] }),
      app({ id: 'e', outcomes: [applied('2026-09-01T00:00:00.000Z')] }),
    ]
    expect(weeklySent(apps, now, 4)).toEqual([0, 0, 1, 2])
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

  it("reports calendar days in the user's zone, the count the Postulaciones card prints", () => {
    // Sent 23:00 on Sep 30 in Mexico City, read 10:00 on Oct 21: 20 elapsed
    // days, 21 calendar days — the card says "hace 21 días", so Hoy must too.
    const late = app({ id: 'late', outcomes: [applied('2026-10-01T05:00:00.000Z')] })
    const stale = staleApplications([late], '2026-10-21T16:00:00.000Z', 'America/Mexico_City')
    expect(stale[0].daysSinceApplied).toBe(21)
    expect(
      calendarDaysSince(
        '2026-10-01T05:00:00.000Z',
        Date.parse('2026-10-21T16:00:00.000Z'),
        'America/Mexico_City',
      ),
    ).toBe(21)
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

describe('attentionApplications — interviews and decisions', () => {
  const now = '2026-08-21T00:00:00.000Z'

  it('puts interviews first and fresh undecided worth-it postings before unsent drafts', () => {
    const apps = [
      app({ id: 'draft', status: 'drafting', createdAt: '2026-08-02T00:00:00.000Z' }),
      app({ id: 'fresh-worth', createdAt: '2026-08-18T00:00:00.000Z' }),
      app({ id: 'fresh-stretch', verdict: 'stretch', createdAt: '2026-08-18T00:00:00.000Z' }),
      app({ id: 'old-worth', createdAt: '2026-07-01T00:00:00.000Z' }),
      app({ id: 'skipped', archived: true, createdAt: '2026-08-19T00:00:00.000Z' }),
      app({
        id: 'interview',
        status: 'interviewing',
        outcomes: [applied('2026-08-01T00:00:00.000Z'), screen('2026-08-05T00:00:00.000Z')],
      }),
    ]
    expect(attentionApplications(apps, now)).toEqual([
      { id: 'interview', reason: 'interviewing' },
      { id: 'fresh-worth', reason: 'decide' },
      { id: 'draft', reason: 'unsent' },
    ])
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

const DAY = 86_400_000
const NOW = '2026-10-15T12:00:00.000Z'
const ago = (d: number) => new Date(Date.parse(NOW) - d * DAY).toISOString()
const sent = (id: string, appliedDaysAgo: number, respondedDaysAgo?: number) => ({
  id,
  source: 'other' as const,
  createdAt: ago(appliedDaysAgo + 1),
  archived: false,
  status: 'applied' as const,
  verdict: 'worth-it' as const,
  requirements: [],
  mappings: [],
  outcomes: [
    { type: 'applied' as const, at: ago(appliedDaysAgo) },
    ...(respondedDaysAgo !== undefined
      ? [{ type: 'screen' as const, at: ago(respondedDaysAgo) }]
      : []),
  ],
})

describe('responseRateSeries', () => {
  // With no reply history the "old enough to have been answered" line is the
  // 10-day default (staleThresholdDays); with replies it is 1.5× the median.
  it('withholds the rate under 3 sends old enough to have been answered', () => {
    const r = responseRateSeries(
      [sent('a', 30, 28), sent('b', 20), sent('c', 3), sent('d', 2)],
      NOW,
    )
    expect(r).toMatchObject({ applied: 2, responded: 1, rate: null, delta: null })
  })
  it('leaves out sends too recent to have been answered', () => {
    const r = responseRateSeries(
      [sent('a', 40, 38), sent('b', 30), sent('c', 25), sent('d', 20), sent('e', 2), sent('f', 1)],
      NOW,
    )
    expect(r).toMatchObject({ applied: 4, responded: 1, rate: 25 })
  })
  it('a recent send that already got a reply still waits its turn', () => {
    const r = responseRateSeries(
      [sent('a', 40), sent('b', 30), sent('c', 25), sent('d', 2, 1)],
      NOW,
    )
    expect(r).toMatchObject({ applied: 3, responded: 0, rate: 0 })
  })
  it('draws a running rate, null until 3 sends have matured', () => {
    const r = responseRateSeries(
      [sent('a', 50, 48), sent('b', 45), sent('c', 40), sent('d', 30), sent('e', 20, 15)],
      NOW,
      8,
    )
    expect(r.series).toHaveLength(8)
    // Weeks end at now-49d, -42d, -35d, …, now. Matured by -35d: a, b, c → 33.
    expect(r.series.slice(0, 2)).toEqual([null, null])
    expect(r.series[2]).toBe(33)
    // By the end every matured send counts: 2 of 5.
    expect(r.series[7]).toBe(40)
  })
  it('suppresses the delta when either 30-day window has fewer than 3 matured sends', () => {
    const r = responseRateSeries(
      [sent('a', 12, 11), sent('b', 13), sent('c', 14), sent('d', 40, 35)],
      NOW,
    )
    expect(r.delta).toBeNull()
  })
  it('compares matured sends in the last 30 days with the 30 before, rounding once', () => {
    const recent = [sent('a', 12, 11), sent('b', 13, 12), sent('c', 14), sent('z', 2)]
    const older = [sent('d', 40), sent('e', 41), sent('f', 42, 39)]
    expect(responseRateSeries([...recent, ...older], NOW).delta).toBe(33)
  })
})

describe('staleDays (one application, a known threshold)', () => {
  const applied = (at: string) => ({ at, type: 'applied' as const })
  it('is the days since sending once past the threshold, null before or once answered/settled', () => {
    const now = '2026-10-20T00:00:00.000Z'
    expect(staleDays({ outcomes: [applied('2026-10-01T00:00:00.000Z')] }, 10, now)).toBe(19)
    expect(staleDays({ outcomes: [applied('2026-10-15T00:00:00.000Z')] }, 10, now)).toBeNull()
    expect(
      staleDays(
        {
          outcomes: [
            applied('2026-10-01T00:00:00.000Z'),
            { at: '2026-10-05T00:00:00.000Z', type: 'acknowledged' },
          ],
        },
        10,
        now,
      ),
    ).toBeNull()
    expect(
      staleDays(
        {
          outcomes: [
            applied('2026-10-01T00:00:00.000Z'),
            { at: '2026-10-05T00:00:00.000Z', type: 'rejected' },
          ],
        },
        10,
        now,
      ),
    ).toBeNull()
  })
})
