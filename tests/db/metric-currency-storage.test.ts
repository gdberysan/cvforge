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
  id: 'ev_money',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: 'Gestioné un presupuesto de 450 mil MXN al mes.',
  metrics: [{ raw: '450 mil MXN al mes', value: 450_000, unit: 'mxn' }],
  tags: [],
  period: { start: '2020-01' },
  strength: 'core',
  origin: 'manual',
}

describe('metric currency at the storage boundary', () => {
  it('stores the currency a currency-named unit implies, so no record enters without it', () => {
    // The old .refine() would have rejected this write outright. Deriving at
    // the one choke point every path shares (manual entry, interview accept,
    // gap-fill accept) keeps the downstream guarantee — compose prints
    // [currency=…] and the verifier builds value+currency forms — without a
    // rejection anywhere.
    withDb((db) => {
      upsertEvidence(db, item)
      const stored = listEvidence(db).find((e) => e.id === 'ev_money')
      expect(stored?.metrics[0].currency).toBe('MXN')
    })
  })
})
