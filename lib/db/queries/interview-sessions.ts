import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { interviewSessions } from '../schema'

export type InterviewSession = {
  id: string
  roleId: string
  answers: { question: string; answer: string }[]
  createdAt: string
}

/**
 * One row per accepted interview — the verbatim Q&A. Re-interviewing a role
 * never overwrites a prior session; each accept adds a new one, dated, so a
 * role's interview history reads as a timeline rather than a single
 * replaced snapshot. Skipped when nothing was actually answered.
 */
export function saveInterviewSession(
  db: Db,
  roleId: string,
  answers: { question: string; answer: string }[],
): void {
  if (answers.length === 0) return
  db.insert(interviewSessions)
    .values({ id: `int_${randomUUID().slice(0, 8)}`, roleId, answers })
    .run()
}

/** A deleted role takes its interview history with it; nothing else references these rows. */
export function deleteInterviewSessions(db: Db, roleId: string): void {
  db.delete(interviewSessions).where(eq(interviewSessions.roleId, roleId)).run()
}

/** All sessions, newest first, optionally scoped to one role. */
export function listInterviewSessions(db: Db, roleId?: string): InterviewSession[] {
  const rows = roleId
    ? db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.roleId, roleId))
        .orderBy(desc(interviewSessions.createdAt))
        .all()
    : db.select().from(interviewSessions).orderBy(desc(interviewSessions.createdAt)).all()
  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    answers: r.answers,
    createdAt: r.createdAt,
  }))
}
