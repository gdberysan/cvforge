import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@/lib/db/wasm/migrations.gen'
import { openWasmDb } from '@/lib/db/wasm/open'
import { ShimDatabase } from '@/lib/db/wasm/shim'
import { judgeCandidate, looksLikeSqlite } from '@/web/lib/db-file'

const sqlite3 = await sqlite3InitModule()
const newest = Math.max(...MIGRATIONS.map((m) => m.folderMillis))
const fresh = () => new sqlite3.oo1.DB(':memory:')

describe('judging an import', () => {
  it('accepts a migrated CVForge database', () => {
    const { shim } = openWasmDb(fresh(), sqlite3.capi)
    expect(judgeCandidate(shim, newest)).toBeNull()
  })

  it('refuses a database that is not CVForge’s', () => {
    const other = new ShimDatabase(fresh(), sqlite3.capi)
    other.exec('create table notes(id integer)')
    expect(judgeCandidate(other, newest)).toBe('not-cvforge')
  })

  it('refuses one written by a newer CVForge', () => {
    const { shim } = openWasmDb(fresh(), sqlite3.capi)
    shim
      .prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
      .run('x', newest + 1)
    expect(judgeCandidate(shim, newest)).toBe('database-too-new')
  })

  it('recognises an SQLite file by its header, and nothing else', () => {
    const { shim } = openWasmDb(fresh(), sqlite3.capi)
    const bytes = sqlite3.capi.sqlite3_js_db_export(shim.wasm)
    expect(looksLikeSqlite(bytes)).toBe(true)
    expect(
      looksLikeSqlite(new TextEncoder().encode('PK\u0003\u0004 a zip, not a database'.padEnd(200))),
    ).toBe(false)
  })
})
