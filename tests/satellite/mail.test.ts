import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import {
  appendOutcome,
  createApplication,
  getApplication,
  listMailOutcomes,
} from '@/lib/db/queries/applications'
import {
  closeMailSuggestion,
  listMailSuggestions,
  readMailStatus,
  requestGmailDisconnect,
  setMailSwitch,
} from '@/lib/satellite/mail'

// The satellite's DDL, verbatim.
const DDL = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS mail_seen (message_id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, from_addr TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', handled_as TEXT NOT NULL, application_id TEXT, claimed_at TEXT);
CREATE TABLE IF NOT EXISTS mail_suggestions (id TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL, from_addr TEXT NOT NULL, subject TEXT NOT NULL, quote TEXT NOT NULL, kind TEXT NOT NULL, candidate_app_ids TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open');
`

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-mail-'))
  file = path.join(dir, 'satellite.db')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function seed(sql = '') {
  const db = new Database(file)
  db.exec(DDL + sql)
  db.close()
}
const row = (key: string) => {
  const db = new Database(file)
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  db.close()
  return r?.value
}

describe('mail suggestions', () => {
  it('lists open ones newest first and closes one exactly once', () => {
    seed(`INSERT INTO mail_suggestions VALUES
      ('s1','m1','2026-10-10T10:00:00.000Z','a@x.com','Old','q1','rejected','["app_1"]','open'),
      ('s2','m2','2026-10-12T10:00:00.000Z','b@x.com','New','q2','screen','[]','open'),
      ('s3','m3','2026-10-13T10:00:00.000Z','c@x.com','Done','q3','offer','[]','dismissed');`)
    expect(listMailSuggestions(file)).toMatchObject([
      { id: 's2', from: 'b@x.com', candidateAppIds: [] },
      { id: 's1', subject: 'Old', quote: 'q1', kind: 'rejected', candidateAppIds: ['app_1'] },
    ])
    expect(closeMailSuggestion(file, 's1', 'accepted')).toBe(true)
    expect(closeMailSuggestion(file, 's1', 'dismissed')).toBe(false)
    expect(listMailSuggestions(file).map((s) => s.id)).toEqual(['s2'])
  })

  it('an unreadable candidate list reads as untied', () => {
    seed(
      `INSERT INTO mail_suggestions VALUES ('s1','m1','2026-10-10T10:00:00.000Z','a','b','c','d','not json','open');`,
    )
    expect(listMailSuggestions(file)[0].candidateAppIds).toEqual([])
  })
})

describe('an agent without the mail tables (Review Focus 3)', () => {
  it('reads nothing, never throws', () => {
    const db = new Database(file)
    db.exec('CREATE TABLE searches (id TEXT)')
    db.close()
    expect(listMailSuggestions(file)).toEqual([])
    expect(closeMailSuggestion(file, 'x', 'dismissed')).toBe(false)
    expect(readMailStatus(file)).toEqual({
      state: 'never',
      account: null,
      readAt: null,
      alerts: true,
      outcomes: true,
      drafts: true,
    })
  })

  it('a missing file is the same', () => {
    const gone = path.join(dir, 'nope.db')
    expect(listMailSuggestions(gone)).toEqual([])
    expect(readMailStatus(gone).state).toBe('never')
  })
})

describe('mail status and switches', () => {
  it('reads the gmail rows and defaults the switches on', () => {
    seed(`INSERT INTO settings VALUES ('gmail-state','"connected"'),('gmail-account','"g@gmail.com"'),
      ('gmail-read-at','"2026-10-16T09:00:00.000Z"'),('mailDrafts','false');`)
    expect(readMailStatus(file)).toEqual({
      state: 'connected',
      account: 'g@gmail.com',
      readAt: '2026-10-16T09:00:00.000Z',
      alerts: true,
      outcomes: true,
      drafts: false,
    })
  })

  it('revoked reads as revoked, junk as never', () => {
    seed(`INSERT INTO settings VALUES ('gmail-state','"revoked"');`)
    expect(readMailStatus(file).state).toBe('revoked')
    seed(`UPDATE settings SET value = '"banana"' WHERE key = 'gmail-state';`)
    expect(readMailStatus(file).state).toBe('never')
  })

  it('writes JSON booleans, as writeAgentSettings does', () => {
    seed()
    setMailSwitch(file, 'mailOutcomes', false)
    expect(row('mailOutcomes')).toBe('false')
    setMailSwitch(file, 'mailOutcomes', true)
    expect(row('mailOutcomes')).toBe('true')
    expect(readMailStatus(file).outcomes).toBe(true)
  })

  it('a disconnect request is written and read back as disconnecting', () => {
    seed(`INSERT INTO settings VALUES ('gmail-state','"connected"');`)
    requestGmailDisconnect(file)
    expect(row('gmail-disconnect-requested')).toBe('true')
    expect(readMailStatus(file).state).toBe('disconnecting')
  })
})

describe('listMailOutcomes', () => {
  it('lists only gmail: events and parses the quote', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const { db, close } = openDb(path.join(d, 't.db'))
    try {
      runMigrations(db as Db)
      const id = createApplication(db, {
        source: 'linkedin',
        company: 'Acme',
        jobTitle: 'Eng',
        market: 'us-remote',
        documentLanguage: 'en',
        postingRaw: 'x',
        postingHash: 'h',
        evidenceHash: 'e',
        requirements: [],
        mappings: [],
        coverage: {
          mandatoryTotal: 0,
          mandatoryStrong: 0,
          mandatoryPartial: 0,
          mandatoryMissing: 0,
          desirableTotal: 0,
          desirableStrong: 0,
          desirablePartial: 0,
          desirableMissing: 0,
          hardBlockers: [],
          unjudgedGates: [],
          verdict: 'stretch',
        },
      })
      appendOutcome(db, id, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
      appendOutcome(db, id, { at: '2026-10-02T00:00:00.000Z', type: 'screen', note: 'user note' })
      const mailId = appendOutcome(db, id, {
        at: '2026-10-05T00:00:00.000Z',
        type: 'rejected',
        note: 'gmail:18c9f «Lamentamos informarte que no continuamos.»',
      })
      expect(listMailOutcomes(db, id)).toEqual([
        {
          id: mailId,
          at: '2026-10-05T00:00:00.000Z',
          type: 'rejected',
          quote: 'Lamentamos informarte que no continuamos.',
          scheduledAt: null,
        },
      ])
      expect(getApplication(db, id)?.outcomes).toHaveLength(3)
    } finally {
      close()
      rmSync(d, { recursive: true, force: true })
    }
  })
})
