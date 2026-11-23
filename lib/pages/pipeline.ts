/** Everything Postulaciones reads (see lib/pages/home.ts). */

import type { Db } from '@/lib/db/client'
import {
  type ApplicationSummary,
  listApplications,
  listFullApplications,
} from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { demoPostings } from '@/lib/demo/postings'
import { type Locale, makeTranslate } from '@/lib/i18n'
import { effectiveMarkets } from '@/lib/markets'
import { cardStatus, hasUpcomingCall, interviewOf, settledParts } from '@/lib/overview-status'
import { CVContentSchema, type OutcomeEvent, type OutcomeType } from '@/lib/schemas'
import { latestOutcome, type StageFacts, stageFacts } from '@/lib/stage'
import { type AttentionItem, attentionApplications, toStatApp } from '@/lib/stats'

/** A card's line of state (`cardStatus`), and whether it names a call still ahead. */
/** A card's one line of state, and what its log proves for the stage track. */
export type CardState = {
  line: string
  upcoming: boolean
  facts?: StageFacts
  /** A settled row's two columns: how it ended, and when. */
  settled?: { end: string; word: string; when: string | null; at: string | null } | null
}

export type PipelineSearch = { show?: string; q?: string; status?: string }

export function loadPipeline(
  db: Db,
  opts: { search: PipelineSearch; locale: Locale; demo: boolean },
) {
  const { locale } = opts
  const t = makeTranslate(locale)
  const { show, q, status } = opts.search
  const showingSkipped = show === 'skipped'
  const now = new Date().toISOString()

  const needle = (q ?? '').trim().toLowerCase()
  const all = listApplications(db, { archived: showingSkipped })
  const applications = all.filter(
    (a) =>
      (!needle ||
        a.jobTitle.toLowerCase().includes(needle) ||
        a.company.toLowerCase().includes(needle)) &&
      (!status || a.status === status),
  )

  // The stats strip: arithmetic over the user's own outcomes, n always shown.
  const fullApps = listFullApplications(db)
  const statApps = fullApps.map(toStatApp)
  // "Documentos listos" only with a CV saved, as the overview decides it.
  const hasCvOf = new Map(
    fullApps.map((a) => [
      a.id,
      CVContentSchema.safeParse((a.documents as { cv?: unknown } | null)?.cv).success,
    ]),
  )
  // The stage track needs the closing event's kind (rejected vs ghosted),
  // which the summary row does not carry.
  const latestOf: Record<string, OutcomeType | null> = Object.fromEntries(
    statApps.map((s) => [s.id, latestOutcome(s.outcomes)]),
  )
  // Each card's one line of state, formatted here in the user's zone so the
  // client never formats a date (React error 418).
  const outcomesOf = new Map(statApps.map((s) => [s.id, s.outcomes]))
  const nowMs = Date.parse(now)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const stateOf = (a: ApplicationSummary): CardState => {
    const outcomes: OutcomeEvent[] = outcomesOf.get(a.id) ?? []
    const interview = interviewOf(outcomes, nowMs, timeZone)
    const input = {
      status: a.status,
      outcomes,
      interview,
      hasCv: hasCvOf.get(a.id) ?? false,
      createdAt: a.createdAt,
      locale,
      timeZone,
      now: nowMs,
    }
    return {
      line: cardStatus(t, input),
      settled: settledParts(t, input),
      upcoming: hasUpcomingCall(interview),
      facts: stageFacts(outcomes),
    }
  }
  const skippedCount = showingSkipped
    ? applications.length
    : listApplications(db, { archived: true }).length
  // Still open only: a closed application is not something to pursue, and
  // counting them headlined "15 worth pursuing" over 20 closed rows.
  // From the whole list, not the search: a query must never change what the
  // title says about the person's pipeline.
  const worthPursuing = all.filter(
    (a) =>
      (a.verdict === 'strong' || a.verdict === 'worth-it') &&
      a.status !== 'closed' &&
      a.status !== 'archived',
  ).length

  // "Piden algo de ti": one shared definition (lib/stats) with the home
  // page's Today panel. Filtering hides the section: a search is already a
  // deliberate visit to the rest of the list.
  const filtering = Boolean(needle || status)
  const attentionItems = showingSkipped || filtering ? [] : attentionApplications(statApps, now)
  const itemOf: Record<string, AttentionItem> = Object.fromEntries(
    attentionItems.map((i) => [i.id, i]),
  )
  const attention = attentionItems
    .map((i) => all.find((a) => a.id === i.id))
    .filter((a): a is ApplicationSummary => Boolean(a))
  const attentionIds = new Set(attention.map((a) => a.id))
  // An offer is the best news on the page: it leads the rest.
  const rest = applications
    .filter((a) => !attentionIds.has(a.id))
    .sort((a, b) => Number(b.status === 'offer') - Number(a.status === 'offer'))

  const owner = getProfile(db)
  const markets = owner
    ? effectiveMarkets(owner.preferences.markets, owner.basics.location)
    : undefined
  return {
    q,
    status,
    showingSkipped,
    filtering,
    all,
    applications,
    attention,
    rest,
    itemOf,
    latestOf,
    stateOf: Object.fromEntries(
      [...applications, ...attention].map((a) => [a.id, stateOf(a)]),
    ) as Record<string, CardState>,
    skippedCount,
    worthPursuing,
    markets,
    demoPostings: opts.demo ? demoPostings(db) : undefined,
  }
}

export type PipelineData = ReturnType<typeof loadPipeline>
