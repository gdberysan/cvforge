import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { backupFilename, createBackup } from '@/lib/db/backup'
import { openDb, runMigrations } from '@/lib/db/client'
import { saveInterviewSession } from '@/lib/db/queries/interview-sessions'

async function withDb(fn: (db: ReturnType<typeof openDb>['db']) => Promise<void> | void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    await fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('createBackup', () => {
  it('produces a valid, independent SQLite file containing the real data', async () => {
    await withDb(async (db) => {
      saveInterviewSession(db, 'exp_1', [{ question: 'Q1', answer: 'A1' }])

      const bytes = await createBackup(db)

      const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-restore-'))
      const restored = path.join(dir, 'restored.db')
      writeFileSync(restored, bytes)

      const check = new Database(restored, { readonly: true })
      try {
        expect(check.pragma('integrity_check', { simple: true })).toBe('ok')
        const row = check.prepare('select count(*) as n from interview_sessions').get() as {
          n: number
        }
        expect(row.n).toBe(1)
      } finally {
        check.close()
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  it('captures data still sitting in the WAL, not just the checkpointed main file', async () => {
    // The exact failure mode a plain file copy hits — this app lost real
    // user data to it once. .backup() must see writes regardless of
    // whether SQLite has checkpointed them into the main file yet.
    await withDb(async (db) => {
      saveInterviewSession(db, 'exp_2', [{ question: 'Q2', answer: 'A2' }])
      const bytes = await createBackup(db)

      const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-restore-'))
      const restored = path.join(dir, 'restored.db')
      writeFileSync(restored, bytes)
      const check = new Database(restored, { readonly: true })
      try {
        const row = check
          .prepare("select answers from interview_sessions where role_id = 'exp_2'")
          .get() as { answers: string }
        expect(JSON.parse(row.answers)).toEqual([{ question: 'Q2', answer: 'A2' }])
      } finally {
        check.close()
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})

describe('backupFilename', () => {
  /**
   * toISOString() is UTC, so anywhere west of Greenwich an evening backup was
   * named with tomorrow's date — a file the user cannot line up with the day
   * they actually took it.
   */
  it('stamps the local date, not the UTC one', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/Mexico_City'
      // 02:00 UTC on the 29th is still the evening of the 28th in Mexico.
      const evening = new Date('2026-08-29T02:00:00Z')
      // Guard: if the runtime ignored TZ there is nothing to assert about.
      expect(evening.getDate()).toBe(28)
      expect(backupFilename(evening)).toBe('cvforge-backup-2026-08-28.db')
      expect(evening.toISOString().slice(0, 10)).toBe('2026-08-29')
    } finally {
      process.env.TZ = original
    }
  })

  it("agrees with the platform's own local calendar date", () => {
    const now = new Date()
    expect(backupFilename(now)).toBe(`cvforge-backup-${now.toLocaleDateString('en-CA')}.db`)
  })

  it('zero-pads single-digit months and days', () => {
    expect(backupFilename(new Date(2026, 0, 5, 12, 0, 0))).toBe('cvforge-backup-2026-01-05.db')
  })
})
