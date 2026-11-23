import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { appendOutcome, createApplication, listOutcomes } from '@/lib/db/queries/applications'
import { listUsedDrafts, markDraftUsed, saveDraft } from '@/lib/db/queries/drafts'

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

const app = (db: Db, hash: string) =>
  createApplication(db, {
    source: 'linkedin',
    company: 'Acme',
    jobTitle: 'Growth Lead',
    market: 'us-remote',
    documentLanguage: 'en',
    postingRaw: 'x',
    postingHash: hash,
    evidenceHash: 'e',
    requirements: [],
    mappings: [],
    coverage: {
      mandatoryTotal: 0,
      mandatoryStrong: 0,
      mandatoryPartial: 0,
      mandatoryMissing: 0,
      desirableTotal: 0,
      desirableStrong: 0,
      desirablePartial: 0,
      desirableMissing: 0,
      hardBlockers: [],
      unjudgedGates: [],
      verdict: 'stretch',
    },
  })

describe('listOutcomes', () => {
  it('returns the whole log with ids, notes and times, oldest first, for one application', () => {
    withDb((db) => {
      const a = app(db, 'a')
      const b = app(db, 'b')
      const i = appendOutcome(db, a, {
        at: '2026-10-10T00:00:00.000Z',
        type: 'interview',
        note: 'gmail:m1 «Hola»',
        scheduledAt: '2026-10-20',
      })
      const ap = appendOutcome(db, a, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
      appendOutcome(db, b, { at: '2026-10-02T00:00:00.000Z', type: 'applied' })
      expect(listOutcomes(db, a)).toEqual([
        {
          id: ap,
          at: '2026-10-01T00:00:00.000Z',
          type: 'applied',
          note: null,
          scheduledAt: null,
          meetingUrl: null,
        },
        {
          id: i,
          at: '2026-10-10T00:00:00.000Z',
          type: 'interview',
          note: 'gmail:m1 «Hola»',
          scheduledAt: '2026-10-20',
          meetingUrl: null,
        },
      ])
      expect(listOutcomes(db, 'nope')).toEqual([])
    })
  })
})

describe('listUsedDrafts', () => {
  it('lists only sent drafts of that application, newest send first', () => {
    withDb((db) => {
      const a = app(db, 'a')
      const b = app(db, 'b')
      const T = Date.parse('2026-10-10T09:00:00.000Z')
      const d1 = saveDraft(db, { applicationId: a, to: '', subject: 'One', body: '' }, T)
      const d2 = saveDraft(db, { applicationId: a, to: '', subject: 'Two', body: '' }, T + 1)
      saveDraft(db, { applicationId: a, to: '', subject: 'Unsent', body: '' }, T + 2)
      const other = saveDraft(db, { applicationId: b, to: '', subject: 'B', body: '' }, T)
      markDraftUsed(db, d1, T + 5000)
      markDraftUsed(db, d2, T + 3000)
      markDraftUsed(db, other, T + 9000)
      expect(listUsedDrafts(db, a)).toEqual([
        { id: d1, usedAt: new Date(T + 5000).toISOString(), subject: 'One' },
        { id: d2, usedAt: new Date(T + 3000).toISOString(), subject: 'Two' },
      ])
    })
  })
})
