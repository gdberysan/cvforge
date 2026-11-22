import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { FindAnalysis } from '@/lib/agent/chase'
import { type Db, openDb, runMigrations } from '@/lib/db/client'

export function withDb(fn: (db: Db) => void | Promise<void>) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-agent-'))
    const { db, close } = openDb(path.join(dir, 'test.db'))
    try {
      runMigrations(db)
      await fn(db)
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

export const find = (over: Partial<FindAnalysis> = {}): FindAnalysis => ({
  source: 'linkedin',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4460829599/?trk=x',
  company: 'Acme',
  jobTitle: 'Growth Marketing Manager',
  market: 'mx',
  documentLanguage: 'es-MX',
  postingRaw: 'Buscamos gerente de growth.',
  postingHash: 'hash_1',
  evidenceHash: 'evh_1',
  requirements: [
    {
      id: 'req_1',
      text: 'Google Ads',
      keyword: 'Google Ads',
      variants: [],
      kind: 'hard',
      mandatory: true,
      weight: 3,
    },
  ],
  mappings: [
    { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: 'ok' },
  ],
  coverage: {
    mandatoryTotal: 1,
    mandatoryStrong: 1,
    mandatoryPartial: 0,
    mandatoryMissing: 0,
    desirableTotal: 0,
    desirableStrong: 0,
    desirablePartial: 0,
    desirableMissing: 0,
    hardBlockers: [],
    unjudgedGates: [],
    verdict: 'strong',
  },
  ...over,
})

/** The satellite's own `shown_postings` DDL (cvforge-satellite src/db/schema.ts). */
export function satelliteFile(dir: string): string {
  const file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.exec(`CREATE TABLE IF NOT EXISTS shown_postings (
    posting_id TEXT PRIMARY KEY NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS run_log (
    at     TEXT NOT NULL,
    event  TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );`)
  db.close()
  return file
}

export function addShown(file: string, postingId: string, data: string, createdAt: string) {
  const db = new Database(file)
  db.prepare('INSERT INTO shown_postings (posting_id, data, created_at) VALUES (?, ?, ?)').run(
    postingId,
    data,
    createdAt,
  )
  db.close()
}
