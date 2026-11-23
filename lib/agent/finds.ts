import Database from 'better-sqlite3'
import type { FindAnalysis } from './chase'

/**
 * The job agent's pending finds: postings it judged at or above the floor
 * and is waiting on the user for, stored in its own SQLite file
 * (`shown_postings`, owned by cvforge-satellite). Read here for the
 * "Nuevas del agente" section; a row is deleted once chased or dismissed,
 * by whichever process did it.
 */
export type PendingFind = { postingId: string; createdAt: string; analysis: FindAnalysis }

type Row = { posting_id: string; data: string; created_at: string }

/** Never creates the file: an agent that never ran has no finds. */
function withFile<T>(file: string, empty: T, fn: (db: Database.Database) => T): T {
  let db: Database.Database
  try {
    db = new Database(file, { fileMustExist: true })
  } catch {
    return empty
  }
  try {
    // Short: this runs inside a page render, on the server's only thread.
    db.pragma('busy_timeout = 1000')
    return fn(db)
  } catch (err) {
    // A busy, corrupt or older file is "no finds", never a broken Hoy. The
    // agent's own Telegram still reaches the user meanwhile.
    if (!(err instanceof Error && /no such table/.test(err.message))) {
      console.error('[finds] could not read the agent database:', err)
    }
    return empty
  } finally {
    db.close()
  }
}

function toFind(r: Row): PendingFind | null {
  try {
    return {
      postingId: r.posting_id,
      createdAt: r.created_at,
      analysis: JSON.parse(r.data) as FindAnalysis,
    }
  } catch {
    // A row this code cannot read is skipped, never a crash on Hoy.
    return null
  }
}

/**
 * Newest first. `maxAgeDays` keeps Hoy about what is fresh: a posting found
 * weeks ago is usually filled, and still chaseable from Telegram.
 */
export function listPendingFinds(
  file: string,
  opts: { maxAgeDays?: number; now?: Date } = {},
): PendingFind[] {
  const since =
    opts.maxAgeDays === undefined
      ? ''
      : new Date((opts.now ?? new Date()).getTime() - opts.maxAgeDays * 86_400_000).toISOString()
  return withFile(file, [] as PendingFind[], (db) =>
    (
      db
        .prepare(
          'SELECT posting_id, data, created_at FROM shown_postings WHERE created_at >= ? ORDER BY created_at DESC',
        )
        .all(since) as Row[]
    )
      .map(toFind)
      .filter((f): f is PendingFind => f !== null),
  )
}

export function getPendingFind(file: string, postingId: string): PendingFind | null {
  return withFile(file, null as PendingFind | null, (db) => {
    const row = db
      .prepare('SELECT posting_id, data, created_at FROM shown_postings WHERE posting_id = ?')
      .get(postingId) as Row | undefined
    return row ? toFind(row) : null
  })
}

export function deletePendingFind(file: string, postingId: string): void {
  withFile(file, undefined, (db) => {
    db.prepare('DELETE FROM shown_postings WHERE posting_id = ?').run(postingId)
  })
}

/**
 * A chase from Hoy, in the agent's own log — the row its Telegram button
 * used to write, and the one the weekly report counts as "Perseguidas".
 */
export function recordChase(file: string, postingId: string, at: Date = new Date()): void {
  withFile(file, undefined, (db) => {
    db.prepare("INSERT INTO run_log (at, event, detail) VALUES (?, 'chase', ?)").run(
      at.toISOString(),
      postingId,
    )
  })
}
