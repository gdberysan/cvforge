import Database from 'better-sqlite3'

/**
 * The job agent's saved searches, edited from Ajustes (spec 2026-10-15
 * Telegram alerts only). The satellite owns the `searches` table and reads
 * it at the start of every scan, so an edit here applies on the next one.
 * The rules came from the bot's old /buscar (retired 2026-10-16; this is
 * now the only writer): label, keywords and location are required,
 * a label is unique whatever its case, and ids are `s-<base36 time>[-N]` so
 * they never collide with the seeded `default-N` rows.
 */
export type SavedSearch = {
  id: string
  label: string
  keywords: string
  location: string
  remote: boolean
  enabled: boolean
}

export type SearchInput = { label: string; keywords: string; location: string; remote: boolean }

type Code = 'search-invalid' | 'search-duplicate' | 'search-not-found' | 'search-last'

type Row = {
  id: string
  label: string
  keywords: string
  location: string
  remote: number
  enabled: number
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

function rows(db: Database.Database): SavedSearch[] {
  return (
    db
      .prepare('SELECT id, label, keywords, location, remote, enabled FROM searches ORDER BY rowid')
      .all() as Row[]
  ).map((r) => ({ ...r, remote: r.remote === 1, enabled: r.enabled === 1 }))
}

/** Tagged like the agent settings writer, so the two sources of a change stay apart in the log. */
function log(db: Database.Database, event: string, detail: string): void {
  db.prepare('INSERT INTO run_log (at, event, detail) VALUES (?, ?, ?)').run(
    new Date().toISOString(),
    event,
    `${detail} (ajustes)`,
  )
}

export function readSearches(file: string): SavedSearch[] {
  return withDb(file, rows)
}

export function addSearch(
  file: string,
  input: SearchInput,
  now: number = Date.now(),
): { ok: true; search: SavedSearch } | { ok: false; code: Code } {
  const label = input.label.trim()
  const keywords = input.keywords.trim()
  const location = input.location.trim()
  if (!label || !keywords || !location) return { ok: false, code: 'search-invalid' }
  return withDb(file, (db) =>
    db.transaction(() => {
      const existing = rows(db)
      if (existing.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
        return { ok: false as const, code: 'search-duplicate' as const }
      }
      const ids = new Set(existing.map((s) => s.id))
      let id = `s-${now.toString(36)}`
      for (let n = 1; ids.has(id); n++) id = `s-${now.toString(36)}-${n}`
      const search = { id, label, keywords, location, remote: input.remote, enabled: true }
      db.prepare(
        'INSERT INTO searches (id, label, keywords, location, remote, enabled) VALUES (?, ?, ?, ?, ?, 1)',
      ).run(id, label, keywords, location, input.remote ? 1 : 0)
      log(db, 'search-added', label)
      return { ok: true as const, search }
    })(),
  )
}

export function setSearchEnabled(
  file: string,
  id: string,
  enabled: boolean,
): { ok: true } | { ok: false; code: Code } {
  return withDb(file, (db) => {
    const found = rows(db).find((s) => s.id === id)
    if (!found) return { ok: false, code: 'search-not-found' }
    db.prepare('UPDATE searches SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
    log(db, 'search-toggled', `${found.label}=${enabled}`)
    return { ok: true }
  })
}

/**
 * Never the last one: the agent re-seeds its three example searches into an
 * empty table when it starts (cvforge-satellite `seedDefaultSearches`), so a
 * deleted last search would quietly come back as three. Off is how one
 * retires it.
 */
export function deleteSearch(file: string, id: string): { ok: true } | { ok: false; code: Code } {
  return withDb(file, (db) => {
    const all = rows(db)
    const found = all.find((s) => s.id === id)
    if (!found) return { ok: false, code: 'search-not-found' }
    if (all.length === 1) return { ok: false, code: 'search-last' }
    db.prepare('DELETE FROM searches WHERE id = ?').run(id)
    log(db, 'search-deleted', found.label)
    return { ok: true }
  })
}
