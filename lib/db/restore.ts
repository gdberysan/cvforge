import { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'

export class DatabaseInUseError extends Error {
  constructor() {
    super('another connection holds the database open')
    this.name = 'DatabaseInUseError'
  }
}

/**
 * Replaces the database file at `filePath` with `bytes` and clears its WAL
 * sidecars. Leaving a stale -wal/-shm pair next to a freshly-swapped main
 * file would let SQLite try to replay write-ahead frames from the OLD
 * database against the NEW one on next open — exactly the kind of silent
 * corruption a restore exists to prevent, not cause.
 *
 * Refuses while another process has the file open. A second process holding
 * its own connection to this same file silently undoes a swap under it: its
 * handle keeps the old rows, its next write goes through, and the backup's
 * contents are gone with `{ok:true}` already returned. Written to a sibling and renamed into place, so a crash halfway
 * leaves the previous database intact — and the previous database is kept
 * beside it as `.pre-restore` regardless.
 */
export function swapDatabaseFile(filePath: string, bytes: Buffer): void {
  if (existsSync(filePath)) {
    assertNotInUse(filePath)
    copyFileSync(filePath, `${filePath}.pre-restore`)
  }
  const staging = `${filePath}.restoring`
  writeFileSync(staging, bytes)
  renameSync(staging, filePath)
  rmSync(`${filePath}-wal`, { force: true })
  rmSync(`${filePath}-shm`, { force: true })
}

/**
 * Leaving WAL mode needs exclusive access: SQLite answers SQLITE_BUSY when
 * any other connection is open, which is precisely the question. A file
 * that is not a database at all cannot be "in use" as one, so any other
 * error is ignored. Succeeding also checkpoints the WAL into the main file,
 * which is why the sidecar removal afterwards is safe.
 */
function assertNotInUse(filePath: string): void {
  let probe: InstanceType<typeof Database> | undefined
  try {
    probe = new Database(filePath)
    probe.pragma('journal_mode = DELETE')
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_BUSY') throw new DatabaseInUseError()
  } finally {
    probe?.close()
  }
}
