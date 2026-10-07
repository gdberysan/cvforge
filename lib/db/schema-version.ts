import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Database } from 'better-sqlite3'

/**
 * A CVForge database stamps its own version: drizzle records every applied
 * migration with the journal's `when`. Code can migrate an OLDER database
 * forward, but a NEWER one is shaped by migrations this build has never
 * heard of — rows parse strictly, so the first unknown coverage shape takes
 * down /pipeline and stats. These two numbers make that mismatch checkable.
 */

/** The newest migration this build ships, from drizzle/meta/_journal.json. */
export function newestKnownMigration(
  migrationsFolder = path.join(process.cwd(), 'drizzle'),
): number {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { when: number }[] }
  return Math.max(0, ...journal.entries.map((e) => e.when))
}

/** The newest migration applied to `sqlite`, or null if it was never migrated. */
export function newestAppliedMigration(sqlite: Database): number | null {
  const table = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get()
  if (!table) return null
  const row = sqlite.prepare('select max(created_at) as at from __drizzle_migrations').get() as {
    at: number | null
  }
  return row.at === null ? null : Number(row.at)
}

/** Thrown when a newer build's database meets this older build. */
export class DatabaseTooNewError extends Error {
  readonly code = 'database-too-new'
  constructor() {
    super(
      'This database was written by a newer version of CVForge. Open it with that version (or newer); this one would misread it.',
    )
  }
}

export function isNewerThanThisBuild(sqlite: Database, known = newestKnownMigration()): boolean {
  const applied = newestAppliedMigration(sqlite)
  return applied !== null && applied > known
}
