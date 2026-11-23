import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { createApplication } from '@/lib/db/queries/applications'
import { getDraft, latestDraft, markDraftUsed, saveDraft } from '@/lib/db/queries/drafts'
import { applications, followUpDrafts } from '@/lib/db/schema'

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

const app = (db: Db) =>
  createApplication(db, {
    source: 'linkedin',
    company: 'Acme',
    jobTitle: 'Growth Lead',
    market: 'us-remote',
    documentLanguage: 'en',
    postingRaw: 'x',
    postingHash: 'h',
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

const T0 = Date.parse('2026-10-10T09:00:00.000Z')

describe('follow-up draft queries', () => {
  it('saves and reads back the newest draft only', () => {
    withDb((db) => {
      const a = app(db)
      expect(latestDraft(db, a)).toBeNull()
      saveDraft(db, { applicationId: a, to: 'hr@acme.com', subject: 'Old', body: 'old' }, T0)
      const id = saveDraft(db, { applicationId: a, to: '', subject: 'New', body: 'new' }, T0 + 1000)
      expect(latestDraft(db, a)).toEqual({
        id,
        to: '',
        subject: 'New',
        body: 'new',
        createdAt: '2026-10-10T09:00:01.000Z',
        usedAt: null,
      })
      // Older drafts are kept, for the count.
      expect(db.select().from(followUpDrafts).all()).toHaveLength(2)
    })
  })

  it('a same-millisecond tie goes to the later insert', () => {
    withDb((db) => {
      const a = app(db)
      saveDraft(db, { applicationId: a, to: '', subject: 'A', body: 'a' }, T0)
      const second = saveDraft(db, { applicationId: a, to: '', subject: 'B', body: 'b' }, T0)
      expect(latestDraft(db, a)?.id).toBe(second)
    })
  })

  it('marks a draft used once; a second mark does not move the date', () => {
    withDb((db) => {
      const a = app(db)
      const id = saveDraft(db, { applicationId: a, to: '', subject: 's', body: 'b' }, T0)
      expect(markDraftUsed(db, id, T0 + 60_000)).toBe(true)
      expect(markDraftUsed(db, id, T0 + 120_000)).toBe(false)
      expect(latestDraft(db, a)?.usedAt).toBe('2026-10-10T09:01:00.000Z')
      expect(getDraft(db, id)).toEqual({ applicationId: a, usedAt: '2026-10-10T09:01:00.000Z' })
      expect(getDraft(db, 'nope')).toBeNull()
    })
  })

  it('goes with its application when the application is deleted', () => {
    withDb((db) => {
      const a = app(db)
      saveDraft(db, { applicationId: a, to: '', subject: 's', body: 'b' }, T0)
      db.delete(applications).where(eq(applications.id, a)).run()
      expect(db.select().from(followUpDrafts).all()).toEqual([])
    })
  })
})
