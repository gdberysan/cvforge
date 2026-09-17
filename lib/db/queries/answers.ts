import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { normalizeQuestion } from '@/lib/answers'
import type { Db } from '../client'
import { answerBank } from '../schema'

export type BankedAnswer = {
  question: string
  answer: string
  language: 'en' | 'es-MX'
}

/** Generate once, refine, reuse: a known question updates in place. */
export function upsertAnswer(db: Db, input: BankedAnswer): void {
  const key = normalizeQuestion(input.question)
  // ISO on both paths: the column default is "YYYY-MM-DD HH:MM:SS", which
  // sorts below every ISO "…T…Z" written by an update within the same day,
  // so the newest-first list once put every edited answer above every
  // fresh one regardless of when either happened.
  const now = new Date().toISOString()
  // Select-then-write inside one transaction, so a double submit cannot
  // insert the same question twice.
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(answerBank)
      .where(and(eq(answerBank.questionKey, key), eq(answerBank.language, input.language)))
      .get()

    if (existing) {
      tx.update(answerBank)
        .set({ question: input.question, answer: input.answer, updatedAt: now })
        .where(eq(answerBank.id, existing.id))
        .run()
      return
    }

    tx.insert(answerBank)
      .values({
        id: `ans_${randomUUID()}`,
        questionKey: key,
        question: input.question,
        answer: input.answer,
        language: input.language,
        updatedAt: now,
      })
      .run()
  })
}

export function listAnswers(db: Db): BankedAnswer[] {
  return db
    .select()
    .from(answerBank)
    .orderBy(desc(answerBank.updatedAt))
    .all()
    .map((row) => ({ question: row.question, answer: row.answer, language: row.language }))
}
