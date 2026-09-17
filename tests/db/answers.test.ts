import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listAnswers, upsertAnswer } from '@/lib/db/queries/answers'

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('answer bank', () => {
  it('stores an answer and finds it under cosmetic question variants', () => {
    withDb((db) => {
      upsertAnswer(db, {
        question: 'Why do you want to work here?',
        answer: 'Because of the mission.',
        language: 'en',
      })

      const all = listAnswers(db)
      expect(all).toHaveLength(1)
      expect(all[0].question).toBe('Why do you want to work here?')
    })
  })

  it('refining a known question replaces the answer instead of duplicating it', () => {
    withDb((db) => {
      upsertAnswer(db, { question: 'Why us?', answer: 'First draft.', language: 'en' })
      upsertAnswer(db, { question: '  WHY US!?  ', answer: 'Refined.', language: 'en' })

      const all = listAnswers(db)
      expect(all).toHaveLength(1)
      expect(all[0].answer).toBe('Refined.')
    })
  })

  it('keeps the same question in different languages as separate answers', () => {
    withDb((db) => {
      upsertAnswer(db, { question: 'Why us?', answer: 'Mission.', language: 'en' })
      upsertAnswer(db, { question: 'Why us?', answer: 'La misión.', language: 'es-MX' })
      expect(listAnswers(db)).toHaveLength(2)
    })
  })
})
