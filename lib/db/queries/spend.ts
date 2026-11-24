import { and, eq, isNull, sql } from 'drizzle-orm'
import { computeCostUsd, type TokenCounts } from '@/lib/spend/cost'
import type { Db } from '../client'
import { apiCalls, openCalls } from '../schema'

export function recordApiCall(
  db: Db,
  input: {
    stage: string
    model: string
    action?: string
    applicationId?: string
    runId?: string
  } & TokenCounts,
): void {
  db.insert(apiCalls)
    .values({
      id: `call_${crypto.randomUUID()}`,
      stage: input.stage,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      cacheWriteTokens: input.cacheWriteTokens,
      costUsd: computeCostUsd(input, input.model),
      action: input.action ?? null,
      applicationId: input.applicationId ?? null,
      runId: input.runId ?? null,
    })
    .run()
}

/**
 * The spend so far. `unknownCost` counts calls that were sent but never
 * answered here (cost_known = 0): they may have been billed, so the total
 * is "at least", never presented as complete.
 */
export function spendSummary(db: Db): { totalUsd: number; calls: number; unknownCost: number } {
  const row = db
    .select({
      totalUsd: sql<number>`coalesce(sum(${apiCalls.costUsd}), 0)`,
      calls: sql<number>`count(*)`,
      unknownCost: sql<number>`coalesce(sum(case when ${apiCalls.costKnown} = 0 then 1 else 0 end), 0)`,
    })
    .from(apiCalls)
    .get()
  return {
    totalUsd: row?.totalUsd ?? 0,
    calls: row?.calls ?? 0,
    unknownCost: row?.unknownCost ?? 0,
  }
}

/** A paid call about to be sent: kept until it ends (see openCalls). */
export function openPaidCall(db: Db, call: { stage: string; model: string }): string {
  const id = `open_${crypto.randomUUID()}`
  db.insert(openCalls).values({ id, stage: call.stage, model: call.model }).run()
  return id
}

export function closePaidCall(db: Db, id: string): void {
  db.delete(openCalls).where(eq(openCalls.id, id)).run()
}

/**
 * Calls still open when the database opens again were cut off with the
 * page: each becomes a spend row whose cost is unknown. Returns how many.
 */
export function settleInterruptedCalls(db: Db): number {
  const open = db.select().from(openCalls).all()
  if (open.length === 0) return 0
  db.transaction((tx) => {
    for (const call of open) {
      tx.insert(apiCalls)
        .values({
          id: `call_${crypto.randomUUID()}`,
          at: call.startedAt,
          stage: call.stage,
          model: call.model,
          costUsd: 0,
          costKnown: false,
        })
        .run()
      tx.delete(openCalls).where(eq(openCalls.id, call.id)).run()
    }
  })
  return open.length
}

/**
 * A run's calls made before its application existed (a new analysis): they
 * belong to the application it just created. Only calls with no application
 * yet, so nothing already attributed moves.
 */
export function attachRunToApplication(
  db: Db,
  runId: string | undefined,
  applicationId: string,
): void {
  if (!runId) return
  db.update(apiCalls)
    .set({ applicationId })
    .where(and(eq(apiCalls.runId, runId), isNull(apiCalls.applicationId)))
    .run()
}

/**
 * What an action usually costs here: the median of its last runs, each run
 * the sum of its calls, counting only runs whose every call has a known
 * cost. Null with no such run yet (the screen then shows the published
 * estimate, or nothing).
 */
export function typicalRunCost(db: Db, action: string, runs = 20): number | null {
  const rows = db
    .select({
      total: sql<number>`sum(${apiCalls.costUsd})`,
      known: sql<number>`min(${apiCalls.costKnown})`,
      last: sql<string>`max(${apiCalls.at})`,
    })
    .from(apiCalls)
    .where(and(eq(apiCalls.action, action), sql`${apiCalls.runId} is not null`))
    .groupBy(apiCalls.runId)
    .orderBy(sql`max(${apiCalls.at}) desc`)
    .limit(runs)
    .all()
    .filter((r) => Number(r.known) === 1)
    .map((r) => Number(r.total))
    .sort((a, b) => a - b)
  if (rows.length === 0) return null
  const mid = Math.floor(rows.length / 2)
  return rows.length % 2
    ? (rows[mid] as number)
    : ((rows[mid - 1] as number) + (rows[mid] as number)) / 2
}

/** What this application's own calls have cost so far, and how many had no known cost. */
export function applicationSpend(db: Db, applicationId: string): { usd: number; unknown: number } {
  const row = db
    .select({
      usd: sql<number>`coalesce(sum(${apiCalls.costUsd}), 0)`,
      unknown: sql<number>`coalesce(sum(case when ${apiCalls.costKnown} then 0 else 1 end), 0)`,
    })
    .from(apiCalls)
    .where(eq(apiCalls.applicationId, applicationId))
    .get()
  return { usd: Number(row?.usd ?? 0), unknown: Number(row?.unknown ?? 0) }
}
