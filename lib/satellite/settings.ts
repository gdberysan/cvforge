import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import {
  AGENT_DEFAULTS,
  type AgentSettings,
  type AgentValidation,
  isFloor,
  isInt,
  validateAgentSettings,
} from './shared'

export * from './shared'
export type { AgentStatus } from './status'

import type { AgentStatus } from './status'

/**
 * The job-agent satellite's settings, read and written in place.
 *
 * The satellite (~/Dev/cvforge-satellite) owns this file and its schema —
 * a `settings` table of JSON values and a `run_log`. It reads settings at
 * the start of every tick, so a change made here applies on the next one
 * with no restart and no Telegram round trip. The validation below mirrors
 * the satellite's own /settings command rule for rule; the satellite never
 * re-validates what it reads, so a value written here that its command
 * would have refused is a value it will run with.
 */

export function isAgentAvailable(file: string | undefined): file is string {
  return Boolean(file && existsSync(file))
}

function open(file: string) {
  const db = new Database(file)
  db.pragma('busy_timeout = 5000')
  return db
}

export function readAgentStatus(file: string, now: number = Date.now()): AgentStatus {
  const db = open(file)
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const stored: Record<string, unknown> = {}
    for (const r of rows) {
      try {
        stored[r.key] = JSON.parse(r.value)
      } catch {
        // A row this code did not write and cannot read keeps its default.
      }
    }
    const settings = { ...AGENT_DEFAULTS, ...pickKnown(stored) }

    const last = db
      .prepare("SELECT at FROM run_log WHERE event = 'triaged' ORDER BY at DESC LIMIT 1")
      .pluck()
      .get() as string | undefined
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    const today = db
      .prepare(
        "SELECT COALESCE(SUM(CAST(detail AS INTEGER)), 0) FROM run_log WHERE event = 'triaged' AND at >= ?",
      )
      .pluck()
      .get(midnight.toISOString()) as number

    const scan = db
      .prepare("SELECT at, detail FROM run_log WHERE event = 'scan' ORDER BY at DESC LIMIT 1")
      .get() as { at: string; detail: string } | undefined

    return { settings, lastTriagedAt: last ?? null, triagedToday: today, lastScan: parseScan(scan) }
  } finally {
    db.close()
  }
}

/** A scan row the satellite wrote ({seen, judged, found}); anything else reads as no scan. */
function parseScan(row: { at: string; detail: string } | undefined): AgentStatus['lastScan'] {
  if (!row) return null
  try {
    const { seen, judged, found } = JSON.parse(row.detail) as Record<string, unknown>
    if (![seen, judged, found].every((n) => Number.isInteger(n))) return null
    return { at: row.at, seen: seen as number, judged: judged as number, found: found as number }
  } catch {
    return null
  }
}

function pickKnown(stored: Record<string, unknown>): Partial<AgentSettings> {
  const out: Partial<AgentSettings> = {}
  if (isInt(stored.dailyCap)) out.dailyCap = stored.dailyCap
  if (isInt(stored.digestSize)) out.digestSize = stored.digestSize
  if (isFloor(stored.verdictFloor)) out.verdictFloor = stored.verdictFloor
  if (stored.salaryFloor === null || isInt(stored.salaryFloor)) {
    out.salaryFloor = stored.salaryFloor as number | null
  }
  if (isInt(stored.wakeStart)) out.wakeStart = stored.wakeStart
  if (isInt(stored.wakeEnd)) out.wakeEnd = stored.wakeEnd
  if (typeof stored.paused === 'boolean') out.paused = stored.paused
  if (typeof stored.followUps === 'boolean') out.followUps = stored.followUps
  if (typeof stored.weeklyReport === 'boolean') out.weeklyReport = stored.weeklyReport
  return out
}

/**
 * Writes every key in one transaction and logs each change to the
 * satellite's run_log the way its own command does, tagged so the two
 * sources of a change stay distinguishable in the history.
 */
export function writeAgentSettings(file: string, next: AgentSettings): AgentValidation {
  const check = validateAgentSettings(next)
  if (!check.ok) return check
  const db = open(file)
  try {
    const current = readSettingsRaw(db)
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    const log = db.prepare('INSERT INTO run_log (at, event, detail) VALUES (?, ?, ?)')
    db.transaction(() => {
      for (const key of Object.keys(next) as (keyof AgentSettings)[]) {
        const value = JSON.stringify(next[key])
        if (current[key] === value) continue
        upsert.run(key, value)
        log.run(new Date().toISOString(), 'setting-changed', `${key}=${value} (cvforge)`)
      }
    })()
    return { ok: true }
  } finally {
    db.close()
  }
}

function readSettingsRaw(db: InstanceType<typeof Database>): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
