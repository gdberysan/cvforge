import type {
  ApplicationStatus,
  Coverage,
  EvidenceMapping,
  OutcomeEvent,
  Requirement,
  Source,
} from '@/lib/schemas'

/**
 * The outcomes layer: arithmetic over the user's own data, nothing else.
 * No model is trained and no outcome predicted (spec §1.2). Every figure
 * travels with its n, and the UI renders "not enough data yet" below
 * threshold rather than implying causation — the honesty rule (§8).
 */

/** Adapts a full application record to the stats shape. */
export function toStatApp(app: {
  id: string
  source: Source
  createdAt: string
  archived: boolean
  status: ApplicationStatus
  coverage: Coverage
  outcomes: OutcomeEvent[]
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}): StatApp {
  return {
    id: app.id,
    source: app.source,
    createdAt: app.createdAt,
    archived: app.archived,
    status: app.status,
    verdict: app.coverage.verdict,
    outcomes: app.outcomes,
    requirements: app.requirements,
    mappings: app.mappings,
  }
}

export type StatApp = {
  id: string
  source: Source
  createdAt: string
  archived: boolean
  status: ApplicationStatus
  verdict: Coverage['verdict']
  outcomes: OutcomeEvent[]
  requirements: Requirement[]
  mappings: EvidenceMapping[]
}

/** Human traction. A rejection is a decision, not traction; ghosting is neither. */
const RESPONSE_TYPES = new Set(['acknowledged', 'screen', 'interview', 'offer'])

/** Outcomes that settle an application — it is no longer waiting on anyone. */
const SETTLED_TYPES = new Set(['rejected', 'withdrawn', 'ghosted', 'offer'])

const sortedByDate = (outcomes: OutcomeEvent[]) =>
  [...outcomes].sort((a, b) => a.at.localeCompare(b.at))

export function appliedAt(app: StatApp): string | null {
  return sortedByDate(app.outcomes).find((o) => o.type === 'applied')?.at ?? null
}

export function respondedAt(app: StatApp): string | null {
  return sortedByDate(app.outcomes).find((o) => RESPONSE_TYPES.has(o.type))?.at ?? null
}

export type BandRow = { applied: number; responded: number }

/**
 * The highest-value stat in the product: response rate by verdict band. This
 * is the data that eventually replaces the guessed thresholds in
 * lib/coverage.ts — where "worth it" stops being a constant and becomes
 * what actually got responses.
 */
export function bandPerformance(apps: StatApp[]): Record<string, BandRow> {
  const bands: Record<string, BandRow> = {}
  for (const app of apps) {
    if (!appliedAt(app)) continue
    const row = bands[app.verdict] ?? { applied: 0, responded: 0 }
    bands[app.verdict] = row
    row.applied += 1
    if (respondedAt(app)) row.responded += 1
  }
  return bands
}

/**
 * Mandatory requirements that keep mapping to nothing, ranked. A recurring
 * gap is as often a hole in the evidence base as in the skills — which is
 * why the UI pairs this with "do you actually have this?".
 */
export function gapRecurrence(apps: StatApp[]): { keyword: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const app of apps) {
    const strengthOf = new Map(app.mappings.map((m) => [m.requirementId, m.strength]))
    for (const req of app.requirements) {
      if (!req.mandatory) continue
      // A requirement with no mapping row at all is uncovered — same as an
      // explicit 'none'. Without the default, missing rows read as covered,
      // the opposite of how coverage counts them.
      if ((strengthOf.get(req.id) ?? 'none') !== 'none') continue
      counts.set(req.keyword, (counts.get(req.keyword) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
}

export function sourcePerformance(
  apps: StatApp[],
): { source: Source; applied: number; responded: number }[] {
  const rows = new Map<Source, { applied: number; responded: number }>()
  for (const app of apps) {
    if (!appliedAt(app)) continue
    const row = rows.get(app.source) ?? { applied: 0, responded: 0 }
    row.applied += 1
    if (respondedAt(app)) row.responded += 1
    rows.set(app.source, row)
  }
  return [...rows.entries()]
    .map(([source, row]) => ({ source, ...row }))
    .sort((a, b) => b.applied - a.applied)
}

/**
 * Which evidence keeps showing up in applications that got responses. Weak
 * at low n — the UI must say so rather than implying causation.
 */
export function evidenceLeaderboard(
  apps: StatApp[],
  // Mappings also cite credential ids (cert_*, edu_*, lang_*); those have no
  // evidence text to label a row with, so when the caller says which ids are
  // evidence, everything else stays off the board.
  evidenceIds?: Set<string>,
): { evidenceId: string; cited: number; responded: number }[] {
  const rows = new Map<string, { cited: number; responded: number }>()
  for (const app of apps) {
    if (!appliedAt(app)) continue
    const responded = Boolean(respondedAt(app))
    const strongIds = new Set(
      app.mappings
        .filter((m) => m.strength === 'strong')
        .flatMap((m) => m.evidenceIds)
        .filter((id) => !evidenceIds || evidenceIds.has(id)),
    )
    for (const id of strongIds) {
      const row = rows.get(id) ?? { cited: 0, responded: 0 }
      row.cited += 1
      if (responded) row.responded += 1
      rows.set(id, row)
    }
  }
  return [...rows.entries()]
    .map(([evidenceId, row]) => ({ evidenceId, ...row }))
    .sort((a, b) => b.responded - a.responded || b.cited - a.cited)
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Whole days elapsed, floored: 6 days 23 hours is still "6d ago" and still
 * inside a 7-day window. One rounding rule for every label and window in the
 * app — two rules put two different day counts on the same row.
 */
export const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY)

export function velocity(
  apps: StatApp[],
  now: string,
): {
  appliedThisWeek: number
  appliedPrevWeek: number
  medianResponseDays: number | null
  timedResponses: number
} {
  const appliedDates = apps.map(appliedAt).filter((d): d is string => Boolean(d))
  // A future-dated entry (a typo in the date field) is not "this week", and
  // a response logged before its application is not a negative gap.
  const inWindow = (d: string, from: number, to: number) => {
    const days = daysBetween(d, now)
    return days >= from && days < to
  }
  const appliedThisWeek = appliedDates.filter((d) => inWindow(d, 0, 7)).length
  const appliedPrevWeek = appliedDates.filter((d) => inWindow(d, 7, 14)).length

  const gaps = apps
    .map((app) => {
      const a = appliedAt(app)
      const r = respondedAt(app)
      return a && r ? daysBetween(a, r) : null
    })
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b)

  const medianResponseDays =
    gaps.length === 0
      ? null
      : gaps.length % 2
        ? gaps[(gaps.length - 1) / 2]
        : Math.round((gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2)

  return { appliedThisWeek, appliedPrevWeek, medianResponseDays, timedResponses: gaps.length }
}

export type AttentionReason = 'interviewing' | 'stale' | 'decide' | 'unsent'
export type AttentionItem = { id: string; reason: AttentionReason; daysSinceApplied?: number }

/** A worth-it posting left undecided this long has probably closed. */
const DECIDE_WINDOW_DAYS = 14

/**
 * What needs the user's move, computed — never a reminder they set. In order
 * of what is at stake: interviews in progress, then stale silence (oldest on
 * top, it decays fastest), then fresh worth-it postings still undecided, then
 * kits drafted but never marked sent (oldest first). One definition for every
 * panel that claims to show it: two hand-rolled copies drifted within a day
 * of each other once already. Each application appears once.
 */
export function attentionApplications(apps: StatApp[], now: string): AttentionItem[] {
  const open = apps.filter((a) => !a.archived)
  const interviewing = open
    .filter((a) => a.status === 'interviewing')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const stale = staleApplications(open, now)
  const decide = open
    .filter(
      (a) =>
        a.status === 'triaged' &&
        (a.verdict === 'strong' || a.verdict === 'worth-it') &&
        Date.parse(now) - Date.parse(a.createdAt) <= DECIDE_WINDOW_DAYS * DAY,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unsent = open
    .filter((a) => a.status === 'drafting')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const seen = new Set<string>()
  const once = (item: AttentionItem): AttentionItem[] => {
    if (seen.has(item.id)) return []
    seen.add(item.id)
    return [item]
  }
  return [
    ...interviewing.flatMap((a) => once({ id: a.id, reason: 'interviewing' })),
    ...stale.flatMap((s) =>
      once({ id: s.id, reason: 'stale', daysSinceApplied: s.daysSinceApplied }),
    ),
    ...decide.flatMap((a) => once({ id: a.id, reason: 'decide' })),
    ...unsent.flatMap((a) => once({ id: a.id, reason: 'unsent' })),
  ]
}

/** Sent, silent, and unsettled: the applications still waiting on a human. */
export function waitingCount(apps: StatApp[]): number {
  return waitingApplications(apps).length
}

/** The same applications as waitingCount, oldest first — the list behind the number. */
export function waitingApplications(apps: StatApp[]): StatApp[] {
  return apps
    .filter(
      (app) =>
        appliedAt(app) && !respondedAt(app) && !app.outcomes.some((o) => SETTLED_TYPES.has(o.type)),
    )
    .sort((a, b) => (appliedAt(a) ?? '').localeCompare(appliedAt(b) ?? ''))
}

/** Fallback until a personal median exists; then 1.5× the median, floor 7. */
const DEFAULT_STALE_DAYS = 10

export function staleThresholdDays(apps: StatApp[], now: string): number {
  const median = velocity(apps, now).medianResponseDays
  return median === null ? DEFAULT_STALE_DAYS : Math.max(7, Math.round(median * 1.5))
}

/** Applied, unanswered, unsettled, and past the threshold: needs a nudge or a ghost entry. */
export function staleApplications(
  apps: StatApp[],
  now: string,
): { id: string; daysSinceApplied: number }[] {
  const threshold = staleThresholdDays(apps, now)
  return apps
    .flatMap((app) => {
      const a = appliedAt(app)
      if (!a || respondedAt(app)) return []
      if (app.outcomes.some((o) => SETTLED_TYPES.has(o.type))) return []
      const days = daysBetween(a, now)
      return days > threshold ? [{ id: app.id, daysSinceApplied: days }] : []
    })
    .sort((a, b) => b.daysSinceApplied - a.daysSinceApplied)
}
