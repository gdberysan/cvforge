import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autoBackupOnce } from '@/lib/db/auto-backup'

let dir: string
let sqlite: Database.Database

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-auto-'))
  sqlite = new Database(path.join(dir, 'cvforge.db'))
  sqlite.exec("create table t (x text); insert into t values ('kept')")
})

afterEach(() => {
  sqlite.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('autoBackupOnce', () => {
  it('writes one readable copy per day and skips a second run the same day', async () => {
    const backups = path.join(dir, 'backups')
    const day = new Date(2026, 9, 14, 20, 0)
    const file = await autoBackupOnce(sqlite, backups, day)
    expect(path.basename(file as string)).toBe('cvforge-backup-2026-10-14.db')
    expect(await autoBackupOnce(sqlite, backups, day)).toBeNull()

    const copy = new Database(file as string, { readonly: true })
    expect(copy.prepare('select x from t').get()).toEqual({ x: 'kept' })
    copy.close()
  })

  it('keeps the newest seven and leaves unrelated files alone', async () => {
    const backups = path.join(dir, 'backups')
    await autoBackupOnce(sqlite, backups, new Date(2026, 9, 1))
    writeFileSync(path.join(backups, 'my-notes.txt'), 'mine')
    for (let d = 2; d <= 10; d++) await autoBackupOnce(sqlite, backups, new Date(2026, 9, d))

    const files = readdirSync(backups).sort()
    expect(files.filter((f) => f.endsWith('.db'))).toEqual(
      [4, 5, 6, 7, 8, 9, 10].map((d) => `cvforge-backup-2026-10-${String(d).padStart(2, '0')}.db`),
    )
    expect(files).toContain('my-notes.txt')
  })
})
