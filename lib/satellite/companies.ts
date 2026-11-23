import Database from 'better-sqlite3'
import type { Site } from './board-probe'

export type { Site }

/**
 * The companies the agent follows, edited from Ajustes (spec 2026-10-16
 * agent stage B). The satellite owns the `companies` table, creates it on
 * start and reads it each scan; CVForge only adds, switches and removes
 * rows. Ids are `c-<base36 time>[-N]`.
 */
export type FollowedCompany = {
  id: string
  name: string
  site: Site
  board: string
  enabled: boolean
  lastCheckedAt: string | null
  lastStatus: 'ok' | 'not-found' | 'error' | null
  openRoles: number | null
}

type Code =
  | 'company-invalid'
  | 'company-url-unknown'
  | 'company-not-found'
  | 'company-duplicate'
  | 'company-gone'
  | 'agent-outdated'

type Row = {
  id: string
  name: string
  site: Site
  board: string
  enabled: number
  last_checked_at: string | null
  last_status: string | null
  open_roles: number | null
}

function withDb<T>(file: string, fn: (db: Database.Database) => T): T {
  const db = new Database(file, { fileMustExist: true })
  try {
    // The agent may be mid-scan, reading these rows.
    db.pragma('busy_timeout = 5000')
    return fn(db)
  } finally {
    db.close()
  }
}

function hasTable(db: Database.Database): boolean {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'companies'")
    .get()
}

function status(s: string | null): FollowedCompany['lastStatus'] {
  return s === 'ok' || s === 'not-found' || s === 'error' ? s : null
}

function rows(db: Database.Database): FollowedCompany[] {
  return (
    db
      .prepare(
        'SELECT id, name, site, board, enabled, last_checked_at, last_status, open_roles FROM companies ORDER BY rowid',
      )
      .all() as Row[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    site: r.site,
    board: r.board,
    enabled: r.enabled === 1,
    lastCheckedAt: r.last_checked_at,
    lastStatus: status(r.last_status),
    openRoles: r.open_roles,
  }))
}

function log(db: Database.Database, event: string, detail: string): void {
  db.prepare('INSERT INTO run_log (at, event, detail) VALUES (?, ?, ?)').run(
    new Date().toISOString(),
    event,
    `${detail} (ajustes)`,
  )
}

/** null = the table is missing: the agent has not been restarted on a build that makes it. */
export function readCompanies(file: string): FollowedCompany[] | null {
  return withDb(file, (db) => (hasTable(db) ? rows(db) : null))
}

export function addCompany(
  file: string,
  c: { name: string; site: Site; board: string },
  now: number = Date.now(),
): { ok: true; company: FollowedCompany } | { ok: false; code: Code } {
  const name = c.name.trim()
  const board = c.board.trim()
  if (!name || !board) return { ok: false, code: 'company-invalid' }
  return withDb(file, (db) => {
    if (!hasTable(db)) return { ok: false as const, code: 'agent-outdated' as const }
    return db
      .transaction(() => {
        const existing = rows(db)
        if (
          existing.some((x) => x.site === c.site && x.board.toLowerCase() === board.toLowerCase())
        ) {
          return { ok: false as const, code: 'company-duplicate' as const }
        }
        const ids = new Set(existing.map((x) => x.id))
        let id = `c-${now.toString(36)}`
        for (let n = 1; ids.has(id); n++) id = `c-${now.toString(36)}-${n}`
        db.prepare(
          'INSERT INTO companies (id, name, site, board, enabled, added_at) VALUES (?, ?, ?, ?, 1, ?)',
        ).run(id, name, c.site, board, new Date(now).toISOString())
        log(db, 'company-added', `${name} (${c.site}/${board})`)
        const company: FollowedCompany = {
          id,
          name,
          site: c.site,
          board,
          enabled: true,
          lastCheckedAt: null,
          lastStatus: null,
          openRoles: null,
        }
        return { ok: true as const, company }
      })
      .immediate()
  })
}

export function setCompanyEnabled(
  file: string,
  id: string,
  enabled: boolean,
): { ok: true } | { ok: false; code: Code } {
  return withDb(file, (db) => {
    if (!hasTable(db)) return { ok: false, code: 'agent-outdated' }
    const found = rows(db).find((x) => x.id === id)
    if (!found) return { ok: false, code: 'company-gone' }
    db.prepare('UPDATE companies SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
    log(db, 'company-toggled', `${found.name}=${enabled}`)
    return { ok: true }
  })
}

export function deleteCompany(file: string, id: string): { ok: true } | { ok: false; code: Code } {
  return withDb(file, (db) => {
    if (!hasTable(db)) return { ok: false, code: 'agent-outdated' }
    const found = rows(db).find((x) => x.id === id)
    if (!found) return { ok: false, code: 'company-gone' }
    db.prepare('DELETE FROM companies WHERE id = ?').run(id)
    log(db, 'company-deleted', found.name)
    return { ok: true }
  })
}
