/**
 * Setup for `npm run test:wasm`: every test that opens a database through
 * openDb() gets SQLite compiled to WebAssembly behind the better-sqlite3
 * shim instead of native better-sqlite3 — the web edition's exact stack, run
 * against the suite the desktop already trusts.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { vi } from 'vitest'

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  const { openWasmDb } = await import('@/lib/db/wasm/open')
  const sqlite3 = await sqlite3InitModule()
  return {
    ...actual,
    openDb: () => {
      const { db, shim } = openWasmDb(new sqlite3.oo1.DB(':memory:'), sqlite3.capi)
      return { db: Object.assign(db, { $client: shim }), close: () => shim.close() }
    },
    // openWasmDb already migrated; drizzle's migrator is idempotent anyway.
    runMigrations: () => {},
  }
})
