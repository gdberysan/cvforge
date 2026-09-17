import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { recordApiCall, spendSummary } from '@/lib/db/queries/spend'

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

describe('spend tracking', () => {
  it('starts at zero with no calls on file', () => {
    withDb((db) => {
      expect(spendSummary(db)).toEqual({ totalUsd: 0, calls: 0 })
    })
  })

  it('accumulates cost and call count across recorded calls', () => {
    withDb((db) => {
      recordApiCall(db, {
        stage: 'extract-requirements',
        model: 'claude-opus-5',
        inputTokens: 1_000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 400,
      })
      recordApiCall(db, {
        stage: 'map-evidence',
        model: 'claude-opus-5',
        inputTokens: 2_000,
        outputTokens: 800,
        cacheReadTokens: 1_500,
        cacheWriteTokens: 0,
      })

      const summary = spendSummary(db)
      expect(summary.calls).toBe(2)
      expect(summary.totalUsd).toBeGreaterThan(0)
      // 3k input + 1.3k output + 1.5k cache read + 400 cache write, all well
      // under a cent each — the total must stay in that order of magnitude.
      expect(summary.totalUsd).toBeLessThan(0.1)
    })
  })
})
