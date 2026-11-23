import webpush from 'web-push'
import type { Db } from '@/lib/db/client'
import { readSettings } from '@/lib/settings'
import { vapidKeys } from './keys'
import { DEFAULT_QUIET, inQuietHours, quietEnds } from './quiet'
import {
  deleteSubscription,
  enqueue,
  listDue,
  listSubscriptions,
  markDelivered,
  removeOutbox,
} from './store'

/**
 * The only way anything in CVForge — or the satellite, through its seam —
 * sends a push. Free of next/* and server-only imports by contract
 * (tests/push/boundary.test.ts). The payload is the whole of what leaves
 * the Mac: never CV text, evidence or profile data.
 */
export type PushMessage = {
  kind:
    | 'verdict-ready'
    | 'document-ready'
    | 'kit-ready'
    | 'kit-failed'
    | 'agent-find'
    | 'follow-up'
    | 'weekly-report'
    | 'mail-outcome'
    | 'test'
  title: string
  body: string
  url: string
}

/** The push service says this subscription no longer exists. */
const GONE = new Set([404, 410])

export async function notify(
  db: Db,
  message: PushMessage,
  now: Date = new Date(),
): Promise<'sent' | 'failed' | 'deferred' | 'no-devices'> {
  if (listSubscriptions(db).length === 0) return 'no-devices'
  const quiet = readSettings().pushQuietHours ?? DEFAULT_QUIET
  if (message.kind !== 'test' && inQuietHours(now, quiet)) {
    enqueue(db, message, quietEnds(now, quiet))
    return 'deferred'
  }
  const { delivered } = await deliver(db, message, now)
  return delivered > 0 ? 'sent' : 'failed'
}

/** The push TTL: past this, a held notification is news nobody needs. */
const STALE_MS = 12 * 60 * 60 * 1000

/**
 * On globalThis, not a module-level `let`: Next gives route handlers, pages
 * and instrumentation.ts separate module registries, and a flag in one copy
 * of this module does not stop a flush started from another.
 */
const globalForFlush = globalThis as unknown as { __cvforgePushFlushing?: boolean }

/**
 * Sends what quiet hours held back. Called every minute by the server.
 * At-least-once: a row is removed only after a device took it (or none are
 * left), so a crash between send and remove can repeat one notification,
 * which the phone collapses by its tag. One flush at a time, so a slow push
 * service cannot make the next minute's flush send the same row again.
 */
export async function flushOutbox(db: Db, now: Date = new Date()): Promise<number> {
  if (globalForFlush.__cvforgePushFlushing) return 0
  globalForFlush.__cvforgePushFlushing = true
  try {
    let sent = 0
    for (const row of listDue(db, now)) {
      if (now.getTime() - Date.parse(row.sendAfter) > STALE_MS) {
        // Twelve hours of failed deliveries end here; the log is the only
        // trace that one was lost. The kind only: never the text.
        console.warn(`[push] dropped a held ${row.kind} notification no device took in 12 h`)
        removeOutbox(db, row.id)
        continue
      }
      const { delivered, devices } = await deliver(
        db,
        { kind: row.kind as PushMessage['kind'], title: row.title, body: row.body, url: row.url },
        now,
      )
      if (delivered > 0 || devices === 0) removeOutbox(db, row.id)
      if (delivered > 0) sent++
    }
    return sent
  } finally {
    globalForFlush.__cvforgePushFlushing = false
  }
}

/**
 * What the phone collapses notifications by. One per thing, not per kind:
 * two finds, or two kits, are two notifications — a newer one replaces an
 * older one only when it is about the same application or posting. A test
 * keeps the bare `test` tag, which public/sw.js shows even with the app in
 * front.
 */
function tagOf(m: PushMessage): string {
  return m.kind === 'test' ? 'test' : `${m.kind}:${m.url}`
}

/** How many devices accepted it, and how many subscriptions are left afterwards. */
async function deliver(
  db: Db,
  m: PushMessage,
  now: Date,
): Promise<{ delivered: number; devices: number }> {
  const { publicKey, privateKey } = vapidKeys()
  const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: tagOf(m) })
  const options = {
    vapidDetails: { subject: 'mailto:cvforge@localhost.invalid', publicKey, privateKey },
    TTL: 60 * 60 * 12,
  }
  let delivered = 0
  for (const s of listSubscriptions(db)) {
    const target = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await webpush.sendNotification(target, payload, options)
        markDelivered(db, s.endpoint, now)
        delivered++
        break
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status && GONE.has(status)) {
          deleteSubscription(db, s.endpoint)
          break
        }
        if (attempt === 2)
          console.warn(`push to ${s.label || 'device'} failed (${status ?? 'network'})`)
      }
    }
  }
  return { delivered, devices: listSubscriptions(db).length }
}
