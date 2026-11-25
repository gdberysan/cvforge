import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { interviewPreps, prepAnswers } from '../schema'

export type PrepRow = {
  id: string
  applicationId: string
  outcomeEventId: string | null
  language: 'en' | 'es-MX'
  content: unknown
  report: unknown
  evidenceHash: string
  createdAt: string
}

export type PrepAnswer = {
  id: string
  applicationId: string
  evidenceIds: string[]
  /**
   * S/T/A/R: a part of a story · Q: his answer to a question · C: his answer
   * to a CV line's follow-up · P: his plan for a gap · D: notes after a round.
   */
  part: 'S' | 'T' | 'A' | 'R' | 'Q' | 'D' | 'C' | 'P'
  question: string
  answer: string
  createdAt: string
}

export function savePrep(
  db: Db,
  row: Omit<PrepRow, 'id' | 'createdAt'>,
  now: number = Date.now(),
): string {
  const id = `prep_${crypto.randomUUID()}`
  db.insert(interviewPreps)
    .values({ ...row, id, createdAt: new Date(now).toISOString() })
    .run()
  return id
}

/** The prep he sees in this language: the newest (insertion order breaks a tie). */
export function latestPrep(
  db: Db,
  applicationId: string,
  language: 'en' | 'es-MX',
): PrepRow | null {
  const row = db
    .select()
    .from(interviewPreps)
    .where(
      and(eq(interviewPreps.applicationId, applicationId), eq(interviewPreps.language, language)),
    )
    .orderBy(desc(interviewPreps.createdAt), desc(sql`rowid`))
    .limit(1)
    .get()
  return row ? (row as PrepRow) : null
}

export function saveAnswer(
  db: Db,
  a: Omit<PrepAnswer, 'id' | 'createdAt'>,
  now: number = Date.now(),
): string {
  const id = `ans_${crypto.randomUUID()}`
  db.insert(prepAnswers)
    .values({ ...a, id, answer: a.answer.trim(), createdAt: new Date(now).toISOString() })
    .run()
  return id
}

/**
 * His answer to one slot, replacing what he wrote there before: editing an
 * answer is the same slot, not a second answer the prep would weigh twice.
 */
export function replaceAnswer(
  db: Db,
  a: Omit<PrepAnswer, 'id' | 'createdAt'>,
  now: number = Date.now(),
): string {
  // Two plain statements, not a transaction: the browser edition's database
  // runs them the same way, and a lost delete only leaves an older answer.
  db.delete(prepAnswers)
    .where(
      and(
        eq(prepAnswers.applicationId, a.applicationId),
        eq(prepAnswers.part, a.part),
        eq(prepAnswers.question, a.question),
      ),
    )
    .run()
  return saveAnswer(db, a, now)
}

export function deleteAnswer(db: Db, applicationId: string, id: string): boolean {
  return (
    db
      .delete(prepAnswers)
      .where(and(eq(prepAnswers.applicationId, applicationId), eq(prepAnswers.id, id)))
      .run().changes > 0
  )
}

export function listAnswers(db: Db, applicationId: string): PrepAnswer[] {
  return db
    .select()
    .from(prepAnswers)
    .where(eq(prepAnswers.applicationId, applicationId))
    .orderBy(asc(prepAnswers.createdAt), asc(sql`rowid`))
    .all() as PrepAnswer[]
}
