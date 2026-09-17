import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { createApplication, setArchived } from '@/lib/db/queries/applications'
import { demoPostings } from '@/lib/demo/postings'

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-postings-'))
  const { db, close } = openDb(path.join(dir, 'p.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const coverage = {
  mandatoryTotal: 0,
  mandatoryStrong: 0,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirablePartial: 0,
  desirableStrong: 0,
  desirableMissing: 0,
  hardBlockers: [],
  verdict: 'skip' as const,
}

function app(db: Db, id: string, company: string, jobTitle: string) {
  createApplication(db, {
    id,
    source: 'other',
    company,
    jobTitle,
    market: 'mx',
    documentLanguage: 'es-MX',
    postingRaw: `posting for ${id}`,
    postingHash: `hash-${id}`,
    evidenceHash: 'ev',
    requirements: [],
    mappings: [],
    coverage,
  })
}

/**
 * The demo chooser lists every seeded posting — including the one the tool
 * said no to, which is archived — in a stable order, the same on every page
 * that shows the box.
 */
describe('demoPostings', () => {
  it('lists active and skipped postings, sorted by id, with label and text', () => {
    withDb((db) => {
      app(db, 'app_demo_2', 'Beta', 'Second')
      app(db, 'app_demo_1', 'Alpha', 'First')
      app(db, 'app_demo_3', 'Gamma', 'Skipped one')
      setArchived(db, 'app_demo_3', true)

      expect(demoPostings(db)).toEqual([
        { id: 'app_demo_1', label: 'First · Alpha', text: 'posting for app_demo_1' },
        { id: 'app_demo_2', label: 'Second · Beta', text: 'posting for app_demo_2' },
        { id: 'app_demo_3', label: 'Skipped one · Gamma', text: 'posting for app_demo_3' },
      ])
    })
  })

  it('is empty on an empty database', () => {
    withDb((db) => expect(demoPostings(db)).toEqual([]))
  })
})
