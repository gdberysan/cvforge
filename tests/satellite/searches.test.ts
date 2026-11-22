import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addSearch, deleteSearch, readSearches, setSearchEnabled } from '@/lib/satellite/searches'

/** The satellite's own schema (cvforge-satellite/src/db/schema.ts), verbatim. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS searches (
  id       TEXT PRIMARY KEY NOT NULL,
  label    TEXT NOT NULL,
  keywords TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  remote   INTEGER NOT NULL DEFAULT 1,
  enabled  INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
INSERT INTO searches VALUES ('default-1', 'Growth MX', 'growth marketing', 'Mexico', 0, 1);
`

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-searches-'))
  file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const log = () => {
  const db = new Database(file)
  try {
    return db.prepare('SELECT event, detail FROM run_log').all()
  } finally {
    db.close()
  }
}

const NOW = Date.parse('2026-10-15T20:00:00Z')

describe('saved searches from Ajustes (the rows the agent reads every scan)', () => {
  it('reads them as the agent does', () => {
    expect(readSearches(file)).toEqual([
      {
        id: 'default-1',
        label: 'Growth MX',
        keywords: 'growth marketing',
        location: 'Mexico',
        remote: false,
        enabled: true,
      },
    ])
  })

  it('adds an enabled search with the agent’s id scheme, and logs it', () => {
    const out = addSearch(
      file,
      { label: ' Backend ', keywords: ' node backend ', location: ' Mexico ', remote: true },
      NOW,
    )
    expect(out).toEqual({
      ok: true,
      search: {
        id: `s-${NOW.toString(36)}`,
        label: 'Backend',
        keywords: 'node backend',
        location: 'Mexico',
        remote: true,
        enabled: true,
      },
    })
    expect(readSearches(file)).toHaveLength(2)
    expect(log()).toEqual([{ event: 'search-added', detail: 'Backend (ajustes)' }])
  })

  it('refuses a missing label, keywords or location', () => {
    for (const bad of [
      { label: '', keywords: 'x', location: 'Mexico', remote: false },
      { label: 'x', keywords: ' ', location: 'Mexico', remote: false },
      { label: 'x', keywords: 'y', location: '', remote: false },
    ]) {
      expect(addSearch(file, bad, NOW)).toEqual({ ok: false, code: 'search-invalid' })
    }
    expect(readSearches(file)).toHaveLength(1)
  })

  it('refuses a label already taken, whatever its case', () => {
    expect(
      addSearch(
        file,
        { label: 'growth mx', keywords: 'x', location: 'Mexico', remote: false },
        NOW,
      ),
    ).toEqual({ ok: false, code: 'search-duplicate' })
  })

  it('turns a search off and on, and deletes it, logging each', () => {
    addSearch(file, { label: 'Backend', keywords: 'node', location: 'Mexico', remote: true }, NOW)
    expect(setSearchEnabled(file, 'default-1', false)).toEqual({ ok: true })
    expect(readSearches(file)[0]?.enabled).toBe(false)
    expect(deleteSearch(file, 'default-1')).toEqual({ ok: true })
    expect(readSearches(file).map((s) => s.label)).toEqual(['Backend'])
    expect(log().slice(1)).toEqual([
      { event: 'search-toggled', detail: 'Growth MX=false (ajustes)' },
      { event: 'search-deleted', detail: 'Growth MX (ajustes)' },
    ])
  })

  it('never deletes the last one: an empty table is re-seeded with the examples when the agent restarts', () => {
    expect(deleteSearch(file, 'default-1')).toEqual({ ok: false, code: 'search-last' })
    expect(readSearches(file)).toHaveLength(1)
  })

  it('an unknown id is not found', () => {
    expect(setSearchEnabled(file, 'nope', true)).toEqual({ ok: false, code: 'search-not-found' })
    expect(deleteSearch(file, 'nope')).toEqual({ ok: false, code: 'search-not-found' })
  })
})
