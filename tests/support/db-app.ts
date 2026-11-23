import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { createApplication } from '@/lib/db/queries/applications'

/** A migrated scratch database, closed and removed after `fn`. */
export function withDb(fn: (db: Db) => void) {
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

/** A bare application, no requirements. */
export const seedApp = (db: Db, company = 'Acme') =>
  createApplication(db, {
    source: 'linkedin',
    company,
    jobTitle: 'Growth Lead',
    market: 'us-remote',
    documentLanguage: 'en',
    postingRaw: 'x',
    postingHash: `h-${company}`,
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
