import { and, eq, lte } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { pushOutbox, pushSubscriptions } from '@/lib/db/schema'

export type StoredSubscription = typeof pushSubscriptions.$inferSelect

export function listSubscriptions(db: Db): StoredSubscription[] {
  return db.select().from(pushSubscriptions).all()
}

export function saveSubscription(
  db: Db,
  s: { endpoint: string; p256dh: string; auth: string; label: string },
): void {
  db.insert(pushSubscriptions)
    .values(s)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: s.p256dh, auth: s.auth, label: s.label },
    })
    .run()
}

export function deleteSubscription(db: Db, endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run()
}

export function markDelivered(db: Db, endpoint: string, at: Date): void {
  db.update(pushSubscriptions)
    .set({ lastOkAt: at.toISOString() })
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .run()
}

/** One pending notification per kind and link: a newer one about the same thing replaces the older, as the tag does on the phone. */
export function enqueue(
  db: Db,
  m: { kind: string; title: string; body: string; url: string },
  sendAfter: Date,
): void {
  db.transaction((tx) => {
    tx.delete(pushOutbox)
      .where(and(eq(pushOutbox.kind, m.kind), eq(pushOutbox.url, m.url)))
      .run()
    tx.insert(pushOutbox)
      .values({ id: `push_${crypto.randomUUID()}`, ...m, sendAfter: sendAfter.toISOString() })
      .run()
  })
}

/** Every notification due by now. Rows stay until removeOutbox: a delivery
 *  that fails is tried again next minute instead of being lost. */
export function listDue(db: Db, now: Date) {
  return db.select().from(pushOutbox).where(lte(pushOutbox.sendAfter, now.toISOString())).all()
}

export function removeOutbox(db: Db, id: string): void {
  db.delete(pushOutbox).where(eq(pushOutbox.id, id)).run()
}

const TWO_DAYS_MS = 48 * 3_600_000

/**
 * Where the phone stands, for anything that falls back when pushes fail:
 * no phone subscribed, a phone that has never taken a push, one silent for
 * two days, or one that works, so a fallback never claims two days of
 * silence that never happened.
 */
export type PushState = 'none' | 'unconfirmed' | 'stale' | 'reachable'

export function pushState(db: Db, now: Date = new Date(), windowMs = TWO_DAYS_MS): PushState {
  const subs = listSubscriptions(db)
  if (subs.length === 0) return 'none'
  const delivered = subs.map((s) => s.lastOkAt).filter((at): at is string => at !== null)
  if (delivered.length === 0) return 'unconfirmed'
  const since = new Date(now.getTime() - windowMs).toISOString()
  return delivered.some((at) => at >= since) ? 'reachable' : 'stale'
}

/** Has any phone taken a push in the last two days? When none has, a
 * fallback channel can step in, so a lost subscription never means silence. */
export function pushReachable(db: Db, now: Date = new Date(), windowMs = TWO_DAYS_MS): boolean {
  return pushState(db, now, windowMs) === 'reachable'
}
