import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { computeCostUsd, type TokenCounts } from '@/lib/spend/cost'
import type { Db } from '../client'
import { apiCalls } from '../schema'

export function recordApiCall(db: Db, input: { stage: string; model: string } & TokenCounts): void {
  db.insert(apiCalls)
    .values({
      id: `call_${randomUUID()}`,
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

export function spendSummary(db: Db): { totalUsd: number; calls: number } {
  const row = db
    .select({
      totalUsd: sql<number>`coalesce(sum(${apiCalls.costUsd}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(apiCalls)
    .get()
  return { totalUsd: row?.totalUsd ?? 0, calls: row?.calls ?? 0 }
}
