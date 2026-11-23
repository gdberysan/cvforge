/**
 * The web edition's database as a file: export it whole, and import one —
 * a web export or a desktop backup — without ever replacing good data with
 * bad. Runs in the Worker that owns the database (see tab-lock.ts).
 *
 * Import is check-then-swap, the browser counterpart of lib/db/restore.ts:
 * the candidate is staged as its own file and must be an SQLite database,
 * pass integrity_check, carry CVForge's tables and come from this build or
 * an older one. Only then is the current database kept aside as
 * `pre-import` and replaced. Opening it again migrates an older one forward.
 * importDb rewrites a desktop file's WAL header, which the SAH-pool VFS
 * cannot use.
 */
import type { ShimDatabase } from '@/lib/db/wasm/shim'

export const MAIN_DB = '/cvforge.db'
export const STAGING_DB = '/cvforge.importing.db'
export const PREVIOUS_DB = '/cvforge.pre-import.db'

/** The SAH-pool utility calls this file uses. */
export type DbPool = {
  importDb(name: string, data: Uint8Array): Promise<number>
  exportFile(name: string): Uint8Array
  unlink(name: string): boolean
  getFileNames(): string[]
}

export type ImportProblem = 'not-a-database' | 'corrupt' | 'not-cvforge' | 'database-too-new'

const HEADER = 'SQLite format 3\u0000'

export function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 100) return false
  for (let i = 0; i < HEADER.length; i++) {
    if (bytes[i] !== HEADER.charCodeAt(i)) return false
  }
  return true
}

/** The newest migration applied to a database, or null if it never was. */
export function appliedMigration(db: ShimDatabase): number | null {
  const table = db
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get()
  if (!table) return null
  const row = db.prepare('select max(created_at) as at from __drizzle_migrations').get() as {
    at: number | null
  }
  return row.at === null ? null : Number(row.at)
}

/**
 * Judges an opened candidate. `newestKnown` is this build's newest migration
 * (the bundled MIGRATIONS' last folderMillis).
 */
export function judgeCandidate(db: ShimDatabase, newestKnown: number): ImportProblem | null {
  let integrity: unknown
  try {
    integrity = db.pragma('integrity_check', { simple: true })
  } catch {
    return 'not-a-database'
  }
  if (integrity !== 'ok') return 'corrupt'
  const profile = db
    .prepare("select 1 from sqlite_master where type = 'table' and name = 'profile'")
    .get()
  const applied = appliedMigration(db)
  if (!profile || applied === null) return 'not-cvforge'
  if (applied > newestKnown) return 'database-too-new'
  return null
}

export type ImportResult = { ok: true } | { ok: false; problem: ImportProblem }

/**
 * Checks `bytes` and, only if they pass, replaces the database with them.
 * `openShim` opens a pool file; `closeCurrent` closes the live database
 * before the swap. The caller reopens MAIN_DB afterwards (which migrates an
 * older database forward).
 */
export async function importInto(args: {
  pool: DbPool
  bytes: Uint8Array
  newestKnown: number
  openShim: (name: string) => ShimDatabase
  closeCurrent: () => void
}): Promise<ImportResult> {
  const { pool, bytes } = args
  if (!looksLikeSqlite(bytes)) return { ok: false, problem: 'not-a-database' }
  pool.unlink(STAGING_DB)
  await pool.importDb(STAGING_DB, bytes)
  let problem: ImportProblem | null
  const candidate = args.openShim(STAGING_DB)
  try {
    problem = judgeCandidate(candidate, args.newestKnown)
  } finally {
    candidate.close()
  }
  if (problem) {
    pool.unlink(STAGING_DB)
    return { ok: false, problem }
  }
  args.closeCurrent()
  if (pool.getFileNames().includes(MAIN_DB)) {
    const previous = pool.exportFile(MAIN_DB)
    pool.unlink(PREVIOUS_DB)
    await pool.importDb(PREVIOUS_DB, previous)
    pool.unlink(MAIN_DB)
  }
  await pool.importDb(MAIN_DB, pool.exportFile(STAGING_DB))
  pool.unlink(STAGING_DB)
  return { ok: true }
}

/**
 * Before opening: a page that died between setting the old database aside
 * and writing the new one left no MAIN_DB. Put the previous one back.
 */
export async function recoverInterruptedImport(pool: DbPool): Promise<boolean> {
  const names = pool.getFileNames()
  if (names.includes(MAIN_DB) || !names.includes(PREVIOUS_DB)) return false
  await pool.importDb(MAIN_DB, pool.exportFile(PREVIOUS_DB))
  return true
}
