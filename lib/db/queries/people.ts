import { and, asc, eq, sql } from 'drizzle-orm'
import { localDay, serverTimeZone } from '@/lib/time'
import type { Db } from '../client'
import { applicationPeople, outcomeEvents } from '../schema'

export type Person = {
  id: string
  applicationId: string
  outcomeEventId: string | null
  name: string
  email: string
  role: string
  roleQuote: string
  source: 'invite' | 'mail' | 'manual'
  hidden: boolean
}

export type AgentPerson = {
  name: string
  email: string
  role?: string
  roleQuote?: string
  source: 'invite' | 'mail'
}

/**
 * One person, however the mail spelled them: case and accents folded, and
 * Outlook's "Ibarra, Marco" read as "Marco Ibarra".
 */
export function foldName(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .trim()
  const comma = plain.indexOf(',')
  const ordered = comma > 0 ? `${plain.slice(comma + 1)} ${plain.slice(0, comma)}` : plain
  return ordered.replace(/\s+/g, ' ').trim()
}

const toPerson = (r: typeof applicationPeople.$inferSelect): Person => ({
  id: r.id,
  applicationId: r.applicationId,
  outcomeEventId: r.outcomeEventId,
  name: r.name,
  email: r.email,
  role: r.role,
  roleQuote: r.roleQuote,
  source: r.source,
  hidden: r.hidden,
})

/** The people he sees: one event's (plus the ones he added by hand) when given, else the whole application's. */
export function listPeople(db: Db, applicationId: string, eventId?: string | null): Person[] {
  const rows = db
    .select()
    .from(applicationPeople)
    .where(
      and(eq(applicationPeople.applicationId, applicationId), eq(applicationPeople.hidden, false)),
    )
    .orderBy(asc(applicationPeople.createdAt), asc(sql`rowid`))
    .all()
    .map(toPerson)
  if (!eventId) return rows
  // His own additions belong to whatever call he is looking at.
  return rows.filter(
    (p) => p.outcomeEventId === eventId || (p.source === 'manual' && !p.outcomeEventId),
  )
}

function allRows(db: Db, applicationId: string): Person[] {
  return db
    .select()
    .from(applicationPeople)
    .where(eq(applicationPeople.applicationId, applicationId))
    .all()
    .map(toPerson)
}

/** The stored row this person is, by email when both have one, else by folded name. */
function sameAs(rows: Person[], p: { name: string; email: string }): Person | undefined {
  const email = p.email.trim().toLowerCase()
  if (email) {
    const byEmail = rows.find((r) => r.email.toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const name = foldName(p.name)
  return name ? rows.find((r) => foldName(r.name) === name && (!r.email || !email)) : undefined
}

/**
 * What the email agent found. A manual or hidden row is his decision and is
 * never touched; an agent row gains an email, an event, or a role — a role
 * only from a newer non-empty quote, never blanked. Returns rows written.
 */
export function upsertAgentPeople(
  db: Db,
  applicationId: string,
  eventId: string | null,
  people: AgentPerson[],
  now: number = Date.now(),
): number {
  const at = new Date(now).toISOString()
  let written = 0
  db.transaction((tx) => {
    for (const p of people) {
      const name = p.name.trim()
      if (!name) continue
      const rows = allRows(tx as unknown as Db, applicationId)
      const found = sameAs(rows, { name, email: p.email })
      const role = p.role?.trim() ?? ''
      const quote = p.roleQuote?.trim() ?? ''
      if (!found) {
        tx.insert(applicationPeople)
          .values({
            id: `per_${crypto.randomUUID()}`,
            applicationId,
            outcomeEventId: eventId,
            name,
            email: p.email.trim(),
            role: role && quote ? role : '',
            roleQuote: role && quote ? quote : '',
            source: p.source,
            createdAt: at,
            updatedAt: at,
          })
          .run()
        written++
        continue
      }
      if (found.source === 'manual' || found.hidden) continue
      const patch: Partial<typeof applicationPeople.$inferInsert> = {}
      if (!found.email && p.email.trim()) patch.email = p.email.trim()
      if (!found.outcomeEventId && eventId) patch.outcomeEventId = eventId
      if (role && quote && (role !== found.role || quote !== found.roleQuote)) {
        patch.role = role
        patch.roleQuote = quote
      }
      if (Object.keys(patch).length === 0) continue
      tx.update(applicationPeople)
        .set({ ...patch, updatedAt: at })
        .where(eq(applicationPeople.id, found.id))
        .run()
      written++
    }
  })
  return written
}

/** His own add or correction: the row becomes manual, so the agent leaves it alone. */
export function saveManualPerson(
  db: Db,
  applicationId: string,
  p: { id?: string; name: string; email: string; role: string },
  now: number = Date.now(),
): string {
  const at = new Date(now).toISOString()
  const values = {
    name: p.name.trim(),
    email: p.email.trim(),
    role: p.role.trim(),
    roleQuote: '',
    source: 'manual' as const,
    hidden: false,
    updatedAt: at,
  }
  const existing =
    (p.id && allRows(db, applicationId).find((r) => r.id === p.id)) ||
    sameAs(allRows(db, applicationId), values)
  if (existing) {
    db.update(applicationPeople).set(values).where(eq(applicationPeople.id, existing.id)).run()
    return existing.id
  }
  const id = `per_${crypto.randomUUID()}`
  db.insert(applicationPeople)
    .values({ id, applicationId, outcomeEventId: null, createdAt: at, ...values })
    .run()
  return id
}

/**
 * A deletion that sticks: the row stays as a hidden manual tombstone. False
 * when the person is not this application's.
 */
export function hidePerson(
  db: Db,
  applicationId: string,
  personId: string,
  now: number = Date.now(),
): boolean {
  const res = db
    .update(applicationPeople)
    .set({ hidden: true, source: 'manual', updatedAt: new Date(now).toISOString() })
    .where(
      and(eq(applicationPeople.id, personId), eq(applicationPeople.applicationId, applicationId)),
    )
    .run()
  return res.changes > 0
}

/** The call's meeting link. False when the event is not this application's. */
export function setMeetingUrl(
  db: Db,
  applicationId: string,
  eventId: string,
  url: string,
): boolean {
  const res = db
    .update(outcomeEvents)
    .set({ meetingUrl: url })
    .where(and(eq(outcomeEvents.id, eventId), eq(outcomeEvents.applicationId, applicationId)))
    .run()
  return res.changes > 0
}

/** Compared as instants: "10:45-06:00" and "16:45:00.000Z" are one call. */
function sameInstant(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length === 10 || b.length === 10) return false
  const ta = Date.parse(a)
  return !Number.isNaN(ta) && ta === Date.parse(b)
}

/**
 * An untimed call may take a timed invite only when it was logged within this
 * of the invite's start: further apart, the invite is another meeting.
 */
export const INVITE_FALLBACK_WINDOW_MS = 7 * 86_400_000

/**
 * What one tied invitation adds (spec 2026-10-18 Settled §1): its people go
 * on the call it is for — the screen/interview at the same instant (or the
 * same day where the user is, when either time is date-only), else the newest call with no
 * link and (when the invite has a time) no time, logged within a week of that time, else the
 * application alone — and its meeting link fills that call's empty link, never replacing one.
 * One transaction.
 */
export function attachInvite(
  db: Db,
  applicationId: string,
  invite: {
    start: string | null
    people: { name: string; email: string }[]
    meetingUrl: string | null
  },
  now: number = Date.now(),
  timeZone: string = serverTimeZone(),
): { eventId: string | null; people: number } {
  return db.transaction((tx) => {
    const calls = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .orderBy(asc(outcomeEvents.at), asc(sql`rowid`))
      .all()
      .filter((o) => o.type === 'interview' || o.type === 'screen')
    const start = invite.start
    const same = start
      ? calls.find(
          (o) =>
            o.scheduledAt !== null &&
            (sameInstant(o.scheduledAt, start) ||
              ((o.scheduledAt.length === 10 || start.length === 10) &&
                localDay(o.scheduledAt, timeZone) === localDay(start, timeZone))),
        )
      : undefined
    // Without a match, only a call with no link — and, when the invite has a
    // time, no time of its own and logged near that time — may take it: a
    // call at another time is another meeting, an untimed call from weeks
    // before is an earlier one (or a stray tap), and a link once set is
    // never replaced.
    const startMs = start ? Date.parse(start) : Number.NaN
    const near = (o: { at: string }) => {
      const t = Date.parse(o.at)
      return (
        !Number.isNaN(t) &&
        !Number.isNaN(startMs) &&
        Math.abs(startMs - t) <= INVITE_FALLBACK_WINDOW_MS
      )
    }
    const target =
      same ??
      calls
        .filter((o) => !o.meetingUrl && (start === null || (o.scheduledAt === null && near(o))))
        .at(-1) ??
      null
    const written = upsertAgentPeople(
      tx as unknown as Db,
      applicationId,
      target?.id ?? null,
      invite.people.map((p) => ({ ...p, source: 'invite' as const })),
      now,
    )
    if (target && invite.meetingUrl && !target.meetingUrl) {
      tx.update(outcomeEvents)
        .set({ meetingUrl: invite.meetingUrl })
        .where(eq(outcomeEvents.id, target.id))
        .run()
    }
    return { eventId: target?.id ?? null, people: written }
  })
}
