import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import type { EvidenceItem } from '@/lib/schemas'

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

const item: EvidenceItem = {
  id: 'ev_gap_1',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: 'Configured Salesforce objects and approval workflows for the sales team.',
  metrics: [],
  tags: ['salesforce'],
  period: { start: '2023-01', end: '2023-11' },
  strength: 'core',
  origin: 'gap-fill',
}

describe('gap-fill origin', () => {
  it('round-trips through the database as its own origin', () => {
    withDb((db) => {
      upsertEvidence(db, item)
      expect(listEvidence(db).find((e) => e.id === 'ev_gap_1')?.origin).toBe('gap-fill')
    })
  })
})
