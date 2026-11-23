import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import { backupFilename } from './backup'

const KEEP = 7
const EVERY_MS = 6 * 60 * 60 * 1000

/**
 * One online-safe snapshot per calendar day into `dir`, keeping the newest
 * KEEP. The manual download stays; this is for the day nobody remembered to
 * take one. Returns the file written, or null when today's already exists.
 */
export async function autoBackupOnce(
  sqlite: Database,
  dir: string,
  now: Date = new Date(),
): Promise<string | null> {
  mkdirSync(dir, { recursive: true })
  const file = path.join(/* turbopackIgnore: true */ dir, backupFilename(now))
  if (existsSync(file)) return null
  // Written aside and renamed: a crash mid-backup must not leave a file
  // that looks like today's good copy and stops the retry.
  const partial = path.join(/* turbopackIgnore: true */ dir, `${backupFilename(now)}.partial`)
  await sqlite.backup(partial)
  renameSync(partial, file)

  const copies = readdirSync(dir)
    .filter((f) => /^cvforge-backup-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
  for (const old of copies.slice(KEEP))
    rmSync(path.join(/* turbopackIgnore: true */ dir, old), { force: true })
  return file
}

/** The day of the newest automatic copy in `dir` (YYYY-MM-DD), or null. */
export function latestAutoBackup(dir: string): string | null {
  if (!existsSync(dir)) return null
  const newest = readdirSync(dir)
    .filter((f) => /^cvforge-backup-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .pop()
  return newest ? newest.slice('cvforge-backup-'.length, -'.db'.length) : null
}

const flag = globalThis as unknown as { __cvforgeAutoBackup?: boolean }

/**
 * Starts the daily backup once per process. Takes a getter, not a handle:
 * a restore swaps the database and reconnects, and the timer must back up
 * whatever is live now. Never throws — a failed backup must not take the
 * app down; it is retried on the next tick.
 */
export function startAutoBackup(current: () => Database, dir: string): void {
  if (flag.__cvforgeAutoBackup) return
  flag.__cvforgeAutoBackup = true
  const tick = () => {
    autoBackupOnce(current(), dir).catch((error) => {
      console.warn('[cvforge] automatic backup failed:', error)
    })
  }
  // Off the boot path: the first page should not wait for a file copy.
  setTimeout(tick, 15_000).unref()
  setInterval(tick, EVERY_MS).unref()
}
