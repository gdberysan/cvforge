import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AGENT_DEFAULTS,
  isAgentAvailable,
  readAgentStatus,
  validateAgentSettings,
  writeAgentSettings,
} from '@/lib/satellite/settings'

/** The satellite's own schema (cvforge-satellite/src/db/schema.ts), verbatim. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
`

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-settings-'))
  file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const rows = (sql: string) => {
  const db = new Database(file)
  try {
    return db.prepare(sql).all() as Record<string, unknown>[]
  } finally {
    db.close()
  }
}

describe('readAgentStatus', () => {
  it('reads the satellite defaults from an empty table and the stored overrides on top', () => {
    expect(readAgentStatus(file).settings).toEqual(AGENT_DEFAULTS)
    const db = new Database(file)
    db.prepare(
      "INSERT INTO settings VALUES ('dailyCap', '2'), ('paused', 'true'), ('verdictFloor', '\"worth-it\"')",
    ).run()
    db.close()
    expect(readAgentStatus(file).settings).toMatchObject({
      dailyCap: 2,
      paused: true,
      verdictFloor: 'worth-it',
    })
  })

  it('reports the last analysis run and how much of the cap is spent today', () => {
    const now = Date.parse('2026-09-16T20:00:00Z')
    const db = new Database(file)
    db.prepare("INSERT INTO run_log VALUES ('2026-09-15T14:00:00.000Z', 'triaged', '5')").run()
    db.prepare("INSERT INTO run_log VALUES ('2026-09-16T14:00:00.000Z', 'triaged', '3')").run()
    db.close()
    const status = readAgentStatus(file, now)
    expect(status.lastTriagedAt).toBe('2026-09-16T14:00:00.000Z')
    expect(status.triagedToday).toBe(3)
  })

  it('is unavailable when the path is unset or the file does not exist', () => {
    expect(isAgentAvailable(undefined)).toBe(false)
    expect(isAgentAvailable(path.join(dir, 'nope.db'))).toBe(false)
    expect(isAgentAvailable(file)).toBe(true)
  })
})

describe("validateAgentSettings — the satellite's own rules", () => {
  it('rejects a zero cap, an empty wake window and an unknown floor', () => {
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, dailyCap: 0 })).toEqual({
      ok: false,
      code: 'agent-invalid',
    })
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, dailyCap: 11 })).toEqual({
      ok: false,
      code: 'agent-invalid',
    })
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, wakeStart: 9, wakeEnd: 9 })).toEqual({
      ok: false,
      code: 'agent-window',
    })
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, verdictFloor: 'skip' as never })).toEqual({
      ok: false,
      code: 'agent-invalid',
    })
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, salaryFloor: -1 })).toEqual({
      ok: false,
      code: 'agent-invalid',
    })
    expect(validateAgentSettings(AGENT_DEFAULTS)).toEqual({ ok: true })
  })
})

describe('writeAgentSettings', () => {
  it('writes only what changed, as the satellite stores it, and logs each change', () => {
    const result = writeAgentSettings(file, { ...AGENT_DEFAULTS, dailyCap: 2, paused: true })
    expect(result).toEqual({ ok: true })
    const stored = Object.fromEntries(
      rows('SELECT key, value FROM settings').map((r) => [r.key, r.value]),
    )
    expect(stored).toEqual({
      digestSize: '3',
      verdictFloor: '"stretch"',
      salaryFloor: 'null',
      wakeStart: '8',
      wakeEnd: '23',
      dailyCap: '2',
      paused: 'true',
      followUps: 'true',
      weeklyReport: 'true',
    })
    const log = rows("SELECT detail FROM run_log WHERE event = 'setting-changed'").map(
      (r) => r.detail,
    )
    expect(log).toContain('dailyCap=2 (cvforge)')
    expect(log).toContain('paused=true (cvforge)')

    // A second identical write logs nothing.
    writeAgentSettings(file, { ...AGENT_DEFAULTS, dailyCap: 2, paused: true })
    expect(rows('SELECT detail FROM run_log').length).toBe(9)
  })

  it('refuses an invalid set without touching the table', () => {
    expect(writeAgentSettings(file, { ...AGENT_DEFAULTS, wakeStart: 10, wakeEnd: 8 })).toEqual({
      ok: false,
      code: 'agent-window',
    })
    expect(rows('SELECT * FROM settings')).toEqual([])
  })
})

describe('follow-ups and the weekly report', () => {
  it('default to on, like the satellite', () => {
    expect(AGENT_DEFAULTS.followUps).toBe(true)
    expect(AGENT_DEFAULTS.weeklyReport).toBe(true)
    expect(readAgentStatus(file).settings).toMatchObject({ followUps: true, weeklyReport: true })
  })

  it('read what the satellite stored, and ignore a value it could not have written', () => {
    const db = new Database(file)
    db.prepare(
      "INSERT INTO settings VALUES ('followUps', 'false'), ('weeklyReport', '\"no\"')",
    ).run()
    db.close()
    expect(readAgentStatus(file).settings).toMatchObject({ followUps: false, weeklyReport: true })
  })

  it('write and log a switch like any other setting', () => {
    expect(writeAgentSettings(file, { ...AGENT_DEFAULTS, weeklyReport: false })).toEqual({
      ok: true,
    })
    const stored = Object.fromEntries(
      rows('SELECT key, value FROM settings').map((r) => [r.key, r.value]),
    )
    expect(stored.weeklyReport).toBe('false')
    expect(rows('SELECT detail FROM run_log').map((r) => r.detail)).toContain(
      'weeklyReport=false (cvforge)',
    )
  })

  it('must be booleans', () => {
    expect(validateAgentSettings({ ...AGENT_DEFAULTS, followUps: 'yes' as never })).toEqual({
      ok: false,
      code: 'agent-invalid',
    })
  })
})

describe('readAgentStatus — last scan', () => {
  it('reads the newest scan row, and null with none', () => {
    expect(readAgentStatus(file).lastScan).toBeNull()
    const db = new Database(file)
    db.prepare("INSERT INTO run_log (at, event, detail) VALUES (?, 'scan', ?)").run(
      '2026-10-15T16:00:00.000Z',
      JSON.stringify({ seen: 4, judged: 1, found: 0 }),
    )
    db.prepare("INSERT INTO run_log (at, event, detail) VALUES (?, 'scan', ?)").run(
      '2026-10-15T17:30:00.000Z',
      JSON.stringify({ seen: 14, judged: 3, found: 1 }),
    )
    db.close()
    expect(readAgentStatus(file).lastScan).toEqual({
      at: '2026-10-15T17:30:00.000Z',
      seen: 14,
      judged: 3,
      found: 1,
    })
  })
})
