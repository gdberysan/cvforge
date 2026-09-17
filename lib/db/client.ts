import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database, { type Database as SqliteDatabase } from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { setSpendRecorder } from '@/lib/ai/spend-hook'
import { isDemo } from '@/lib/demo/mode'
import { loadSeed, SeedSchema } from '@/lib/demo/seed'
import { recordApiCall } from './queries/spend'
import { swapDatabaseFile } from './restore'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

// The wider return type here (not on the shared Db alias) matters: Db alone
// is what every function taking either the top-level handle OR a
// db.transaction() callback's `tx` accepts, and a transaction object has no
// $client. Only openDb()'s direct callers (never a transaction) get the
// real, wider shape — needed for createBackup(), which drizzle doesn't wrap.
export function openDb(file: string): { db: Db & { $client: SqliteDatabase }; close: () => void } {
  mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 10000')
  sqlite.pragma('foreign_keys = ON')
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() }
}

export function runMigrations(database: Db): void {
  migrate(database, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
}

const DB_PATH = process.env.CVFORGE_DB_PATH ?? './data/cvforge.db'

/**
 * Process-wide singleton. Next's dev server hot-reloads modules, so the handle
 * is cached on globalThis to avoid leaking SQLite connections on every edit.
 */
const globalForDb = globalThis as unknown as { __cvforgeDb?: Db }

/**
 * Migrations run when the handle is first opened, not from a separate command.
 * Nothing called runMigrations on this singleton, so a clone with no `data/`
 * directory answered its own first page with "no such table: profile" — the
 * one screen a new user is guaranteed to see. Migrating is idempotent.
 *
 * Demo (product spec §5.4): an in-memory database, migrated and loaded from
 * demo/seed.json through the normal query layer. A process-level singleton
 * is safe because every write path is blocked in demo.
 */
function connect(): Db {
  if (isDemo()) {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const handle = drizzle(sqlite, { schema })
    runMigrations(handle)
    const seed = SeedSchema.parse(
      JSON.parse(readFileSync(path.join(process.cwd(), 'demo', 'seed.json'), 'utf8')),
    )
    loadSeed(handle, seed)
    return handle
  }
  const { db: handle } = openDb(DB_PATH)
  runMigrations(handle)
  return handle
}

function getDb(): Db {
  if (!globalForDb.__cvforgeDb) globalForDb.__cvforgeDb = connect()
  return globalForDb.__cvforgeDb
}

/**
 * Replaces the live database with `bytes` and drops the cached connection —
 * the very next access through `db` reconnects fresh against the restored
 * file via the same lazy getDb() path every other request already uses, not
 * a special case. The old connection is closed first so nothing keeps a
 * lock on the file about to be overwritten.
 *
 * Demo's database is in-memory and read-only on every write path already,
 * but silently "restoring" onto it would vanish on process exit with no
 * error at all, so it's refused explicitly instead of pretending to work.
 */
export function restoreDatabase(bytes: Buffer): void {
  if (isDemo()) throw new Error('restore is not available in demo mode')
  const cached = globalForDb.__cvforgeDb as (Db & { $client: SqliteDatabase }) | undefined
  cached?.$client.close()
  globalForDb.__cvforgeDb = undefined
  swapDatabaseFile(DB_PATH, bytes)
}

/**
 * Lazy: `next build` imports every route module to collect its config, and a
 * module-scope connect() made parallel build workers migrate the same file at
 * once -> "database is locked". Nothing opens SQLite until a request uses it.
 */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

// Every model call lands one spend row. Registered here to keep lib/ai itself
// free of database imports — but NOT because every AI route loads this module:
// it does not. `/api/ai/parse-cv` never touches the DB, and route handlers get
// their own module registry anyway, so believing that invariant is what let a
// CV import bill two Opus calls and record neither. `instrumentation.ts` now
// forces this import at startup, and the recorder lives on globalThis so it
// survives the registry split. Safe to import early: `db` is a lazy Proxy, so
// nothing opens SQLite or migrates until a request actually uses it.
setSpendRecorder((record) => recordApiCall(db, record))
