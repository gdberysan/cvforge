import Database from 'better-sqlite3'

/**
 * The agent's `searchTitles` setting (spec 2026-10-17 ruling I2), a JSON
 * string array in the satellite's `settings` table. When the row is absent
 * it is seeded once from the profile's target titles — on first read or
 * write, here or in the agent, whichever comes first — so switching to this
 * setting changes nothing the agent did the day before. Migration-free.
 */
export const SEARCH_TITLES_KEY = 'searchTitles'

function open(file: string) {
  const db = new Database(file, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  return db
}

function parse(value: string): string[] {
  try {
    const v = JSON.parse(value) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The stored list; when there is none yet, the profile's titles are stored and returned. */
export function readSearchTitles(file: string, profileTitles: string[]): string[] {
  const db = open(file)
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SEARCH_TITLES_KEY) as
      | { value: string }
      | undefined
    if (row) return parse(row.value)
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
      SEARCH_TITLES_KEY,
      JSON.stringify(profileTitles),
    )
    const stored = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SEARCH_TITLES_KEY) as { value: string }
    return parse(stored.value)
  } finally {
    db.close()
  }
}

/** Replaces the list (already normalised) and logs the change like every Ajustes edit. */
export function writeSearchTitles(file: string, titles: string[]): void {
  const db = open(file)
  try {
    const value = JSON.stringify(titles)
    db.transaction(() => {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(SEARCH_TITLES_KEY, value)
      db.prepare('INSERT INTO run_log (at, event, detail) VALUES (?, ?, ?)').run(
        new Date().toISOString(),
        'setting-changed',
        `${SEARCH_TITLES_KEY}=${value} (cvforge)`,
      )
    })()
  } finally {
    db.close()
  }
}
