import { asc, eq } from 'drizzle-orm'
import { deriveCurrency, type EvidenceItem, EvidenceItemSchema } from '@/lib/schemas'
import type { Db } from '../client'
import { evidenceItems } from '../schema'

/**
 * Sorted by recorded position, then id — deterministic, which is all the AI
 * prompt cache needs (the projection re-sorts by id itself before hashing).
 * Position is what the editor shows: without it, "ev_10" sorts above "ev_2"
 * the moment a role passes nine records.
 */
export function listEvidence(db: Db): EvidenceItem[] {
  return db
    .select()
    .from(evidenceItems)
    .orderBy(asc(evidenceItems.sortOrder), asc(evidenceItems.id))
    .all()
    .map((row) =>
      EvidenceItemSchema.parse({
        id: row.id,
        kind: row.kind,
        sourceRef: { type: row.sourceType, id: row.sourceId },
        text: row.text,
        metrics: row.metrics,
        tags: row.tags,
        period: { start: row.periodStart, ...(row.periodEnd ? { end: row.periodEnd } : {}) },
        strength: row.strength,
        origin: row.origin,
      }),
    )
}

/**
 * `sortOrder` names the item's position when given (import and interview pass
 * their index). Omitted — the editor's debounced save — an update keeps the
 * stored position instead of teleporting the record to the top.
 */
export function upsertEvidence(db: Db, item: EvidenceItem, sortOrder?: number): void {
  const v = EvidenceItemSchema.parse(item)
  const values = {
    id: v.id,
    kind: v.kind,
    sourceType: v.sourceRef.type,
    sourceId: v.sourceRef.id,
    text: v.text,
    // The choke point every write path shares — manual entry, interview
    // accept, gap-fill accept — so no stored money metric lacks its currency
    // when the unit already names it.
    metrics: v.metrics.map(deriveCurrency),
    tags: v.tags,
    periodStart: v.period.start,
    periodEnd: v.period.end ?? null,
    strength: v.strength,
    origin: v.origin,
  }
  db.insert(evidenceItems)
    .values({ ...values, sortOrder: sortOrder ?? 0 })
    .onConflictDoUpdate({
      target: evidenceItems.id,
      set: sortOrder === undefined ? values : { ...values, sortOrder },
    })
    .run()
}

/**
 * Returns the deleted row's stored position so an undo can restore it there.
 * Without it, re-inserting lands at sortOrder 0 and the record teleports to the
 * top of its group. Null when the row did not exist.
 */
export function deleteEvidence(db: Db, id: string): number | null {
  const row = db
    .select({ sortOrder: evidenceItems.sortOrder })
    .from(evidenceItems)
    .where(eq(evidenceItems.id, id))
    .get()
  db.delete(evidenceItems).where(eq(evidenceItems.id, id)).run()
  return row?.sortOrder ?? null
}
