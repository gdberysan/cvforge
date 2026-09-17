import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createBackup, validateBackup } from '@/lib/db/backup'
import { openDb, runMigrations } from '@/lib/db/client'
import { saveProfile } from '@/lib/db/queries/profile'
import { DatabaseInUseError, swapDatabaseFile } from '@/lib/db/restore'

const profile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: '',
    email: 'x@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: [] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

async function realBackupBytes(): Promise<Buffer> {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    saveProfile(db, profile)
    return await createBackup(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('validateBackup', () => {
  it('accepts a real backup produced by createBackup', async () => {
    expect(validateBackup(await realBackupBytes())).toEqual({ ok: true })
  })

  it('rejects a file that is not SQLite at all', () => {
    expect(validateBackup(Buffer.from('not a database, just text'))).toEqual({
      ok: false,
      error: 'not-sqlite',
    })
  })

  it('rejects a real SQLite file that is not a CVForge backup', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const file = path.join(dir, 'other.db')
    const db = new Database(file)
    db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
    db.close()
    const bytes = readFileSync(file)
    rmSync(dir, { recursive: true, force: true })
    expect(validateBackup(bytes)).toEqual({ ok: false, error: 'not-a-cvforge-backup' })
  })
})

describe('swapDatabaseFile', () => {
  it('refuses while another connection holds the file — a second process', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const target = path.join(dir, 'cvforge.db')
    const other = new Database(target)
    other.pragma('journal_mode = WAL')
    other.exec('CREATE TABLE t (x)')
    other.exec("INSERT INTO t VALUES ('live')")
    try {
      expect(() => swapDatabaseFile(target, Buffer.from('restored'))).toThrow(DatabaseInUseError)
      expect(other.prepare('SELECT x FROM t').pluck().get()).toBe('live')
    } finally {
      other.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the previous database beside the restored one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const target = path.join(dir, 'cvforge.db')
    writeFileSync(target, 'old content')
    swapDatabaseFile(target, Buffer.from('new content'))
    expect(readFileSync(`${target}.pre-restore`, 'utf8')).toBe('old content')
    expect(existsSync(`${target}.restoring`)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('replaces the file at the given path with the new bytes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const target = path.join(dir, 'cvforge.db')
    writeFileSync(target, 'old content')
    swapDatabaseFile(target, Buffer.from('new content'))
    expect(readFileSync(target, 'utf8')).toBe('new content')
    rmSync(dir, { recursive: true, force: true })
  })

  it('removes stale -wal and -shm sidecars so no orphaned WAL frames survive the swap', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const target = path.join(dir, 'cvforge.db')
    writeFileSync(target, 'old')
    writeFileSync(`${target}-wal`, 'stale wal')
    writeFileSync(`${target}-shm`, 'stale shm')
    swapDatabaseFile(target, Buffer.from('restored'))
    expect(existsSync(`${target}-wal`)).toBe(false)
    expect(existsSync(`${target}-shm`)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
