import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { followUpDrafts } from '../schema'

export type FollowUpDraft = {
  id: string
  to: string
  subject: string
  body: string
  createdAt: string
  usedAt: string | null
}

/** A new draft for an application; older ones are kept (spec §5: "for the count"). */
export function saveDraft(
  db: Db,
  d: { applicationId: string; to: string; subject: string; body: string },
  now: number = Date.now(),
): string {
  const id = `fud_${crypto.randomUUID()}`
  db.insert(followUpDrafts)
    .values({
      id,
      applicationId: d.applicationId,
      createdAt: new Date(now).toISOString(),
      to: d.to,
      subject: d.subject,
      body: d.body,
    })
    .run()
  return id
}

/** The one draft the application shows: the newest (insertion order breaks a same-ms tie). */
export function latestDraft(db: Db, applicationId: string): FollowUpDraft | null {
  const row = db
    .select({
      id: followUpDrafts.id,
      to: followUpDrafts.to,
      subject: followUpDrafts.subject,
      body: followUpDrafts.body,
      createdAt: followUpDrafts.createdAt,
      usedAt: followUpDrafts.usedAt,
    })
    .from(followUpDrafts)
    .where(eq(followUpDrafts.applicationId, applicationId))
    .orderBy(desc(followUpDrafts.createdAt), desc(sql`rowid`))
    .limit(1)
    .get()
  return row ?? null
}

/** The drafts the user said he sent, newest send first: Seguimiento's "Tú" list. */
export function listUsedDrafts(
  db: Db,
  applicationId: string,
): { id: string; usedAt: string; subject: string }[] {
  return db
    .select({
      id: followUpDrafts.id,
      usedAt: followUpDrafts.usedAt,
      subject: followUpDrafts.subject,
    })
    .from(followUpDrafts)
    .where(and(eq(followUpDrafts.applicationId, applicationId), isNotNull(followUpDrafts.usedAt)))
    .orderBy(desc(followUpDrafts.usedAt), desc(sql`rowid`))
    .all()
    .flatMap((d) => (d.usedAt ? [{ id: d.id, usedAt: d.usedAt, subject: d.subject }] : []))
}

/**
 * "Ya lo envié". The first time is the send date; a second tap does not move
 * it. True only for the call that set it, so its side effects run once.
 */
export function markDraftUsed(db: Db, id: string, now: number = Date.now()): boolean {
  const out = db
    .update(followUpDrafts)
    .set({ usedAt: new Date(now).toISOString() })
    .where(and(eq(followUpDrafts.id, id), isNull(followUpDrafts.usedAt)))
    .run()
  return out.changes > 0
}

/** One draft by id, with its application: the action checks ownership with it. */
export function getDraft(
  db: Db,
  id: string,
): { applicationId: string; usedAt: string | null } | null {
  const row = db
    .select({ applicationId: followUpDrafts.applicationId, usedAt: followUpDrafts.usedAt })
    .from(followUpDrafts)
    .where(eq(followUpDrafts.id, id))
    .get()
  return row ?? null
}
