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
  part: 'S' | 'T' | 'A' | 'R'
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

export function listAnswers(db: Db, applicationId: string): PrepAnswer[] {
  return db
    .select()
    .from(prepAnswers)
    .where(eq(prepAnswers.applicationId, applicationId))
    .orderBy(asc(prepAnswers.createdAt), asc(sql`rowid`))
    .all() as PrepAnswer[]
}
