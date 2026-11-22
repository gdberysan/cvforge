import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setPaidCallLedger, trackPaidCall } from '@/lib/ai/in-flight'
import { openDb, runMigrations } from '@/lib/db/client'
import {
  closePaidCall,
  openPaidCall,
  recordApiCall,
  settleInterruptedCalls,
  spendSummary,
} from '@/lib/db/queries/spend'
import { openCalls } from '@/lib/db/schema'
import { withDb } from '../support/db-app'

afterEach(() => setPaidCallLedger(null))

describe('paid calls in flight', () => {
  it('a call is on record while it runs and gone once it ends, answered or failed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-open-'))
    const { db, close } = openDb(path.join(dir, 'test.db'))
    try {
      runMigrations(db)
      setPaidCallLedger({ open: (c) => openPaidCall(db, c), close: (id) => closePaidCall(db, id) })
      let during = -1
      const answer = await trackPaidCall(
        async () => {
          during = db.select().from(openCalls).all().length
          return 'answer'
        },
        { stage: 'compose-cv', model: 'claude-opus-5' },
      )
      await expect(
        trackPaidCall(async () => {
          throw new Error('overloaded')
        }),
      ).rejects.toThrow('overloaded')
      expect(answer).toBe('answer')
      expect(during).toBe(1)
      expect(db.select().from(openCalls).all()).toEqual([])
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a ledger that cannot write never costs the person the call', async () => {
    setPaidCallLedger({
      open: () => {
        throw new Error('disk full')
      },
      close: () => {},
    })
    expect(await trackPaidCall(async () => 42)).toBe(42)
  })

  it('a call still open when the database opens again becomes an unknown cost, counted', () => {
    withDb((db) => {
      recordApiCall(db, {
        stage: 'triage',
        model: 'claude-opus-5',
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })
      const before = spendSummary(db)
      openPaidCall(db, { stage: 'compose-cv', model: 'claude-opus-5' })
      openPaidCall(db, { stage: 'verify-distortion', model: 'claude-opus-5' })
      expect(settleInterruptedCalls(db)).toBe(2)
      expect(settleInterruptedCalls(db)).toBe(0)
      const after = spendSummary(db)
      expect(after.calls).toBe(before.calls + 2)
      expect(after.totalUsd).toBe(before.totalUsd)
      expect(after.unknownCost).toBe(2)
      expect(before.unknownCost).toBe(0)
    })
  })
})
