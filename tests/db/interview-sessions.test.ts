import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listInterviewSessions, saveInterviewSession } from '@/lib/db/queries/interview-sessions'

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

describe('interview sessions', () => {
  it('stores the verbatim Q&A for a role', () => {
    withDb((db) => {
      saveInterviewSession(db, 'exp_1', [
        { question: 'What did you spend most of your time on?', answer: 'Search campaigns.' },
      ])
      const sessions = listInterviewSessions(db, 'exp_1')
      expect(sessions).toHaveLength(1)
      expect(sessions[0].answers).toEqual([
        { question: 'What did you spend most of your time on?', answer: 'Search campaigns.' },
      ])
    })
  })

  it('re-interviewing adds a new session rather than replacing the prior one', () => {
    withDb((db) => {
      saveInterviewSession(db, 'exp_1', [{ question: 'Q1', answer: 'A1' }])
      saveInterviewSession(db, 'exp_1', [{ question: 'Q2', answer: 'A2' }])
      const sessions = listInterviewSessions(db, 'exp_1')
      expect(sessions).toHaveLength(2)
    })
  })

  it('never persists a session with nothing answered', () => {
    withDb((db) => {
      saveInterviewSession(db, 'exp_1', [])
      expect(listInterviewSessions(db, 'exp_1')).toHaveLength(0)
    })
  })

  it('scopes to one role, and lists all roles when unscoped, newest first', () => {
    withDb((db) => {
      saveInterviewSession(db, 'exp_1', [{ question: 'Q1', answer: 'A1' }])
      saveInterviewSession(db, 'exp_2', [{ question: 'Q2', answer: 'A2' }])
      expect(listInterviewSessions(db, 'exp_1')).toHaveLength(1)
      expect(listInterviewSessions(db)).toHaveLength(2)
    })
  })
})
