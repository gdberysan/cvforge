import type { Database as BetterSqlite } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { Db } from '../client'
import * as schema from '../schema'
import { MIGRATIONS } from './migrations.gen'
import { ShimDatabase, type WasmCapi, type WasmDb } from './shim'

/**
 * The web edition's database: an open sqlite-wasm handle presented as the
 * same `Db` every query in lib/db/queries takes, migrated from the bundled
 * migrations. The caller owns where the handle lives (OPFS in a Worker,
 * memory in tests).
 */
export function openWasmDb(wasm: WasmDb, capi: WasmCapi): { db: Db; shim: ShimDatabase } {
  const shim = new ShimDatabase(wasm, capi)
  shim.pragma('foreign_keys = ON')
  // drizzle types its driver against better-sqlite3; the shim is that surface.
  const db = drizzle(shim as unknown as BetterSqlite, { schema })
  // What drizzle's own migrators do with bundled files (expo, durable
  // objects): the dialect and session are internal, hence the cast.
  const internal = db as unknown as {
    dialect: { migrate(m: typeof MIGRATIONS, s: unknown, c: { migrationsFolder: string }): void }
    session: unknown
  }
  internal.dialect.migrate(MIGRATIONS, internal.session, { migrationsFolder: '' })
  return { db, shim }
}
