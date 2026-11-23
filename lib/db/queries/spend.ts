import { eq, sql } from 'drizzle-orm'
import { computeCostUsd, type TokenCounts } from '@/lib/spend/cost'
import type { Db } from '../client'
import { apiCalls, openCalls } from '../schema'

export function recordApiCall(db: Db, input: { stage: string; model: string } & TokenCounts): void {
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
