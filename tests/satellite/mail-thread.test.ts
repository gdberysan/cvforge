import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listMailThread } from '@/lib/satellite/mail'

// mail_seen as satellites before 2026-10-17 created it (no kind, no event_at).
const OLD_SEEN = `CREATE TABLE mail_seen (message_id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, from_addr TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', handled_as TEXT NOT NULL, application_id TEXT, claimed_at TEXT);`
// The 2026-10-17 additions (spec §1.2.1, §1.2.4).
const NEW_COLUMNS = `ALTER TABLE mail_seen ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_seen ADD COLUMN event_at TEXT;`
const HISTORY = `CREATE TABLE mail_history (message_id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, from_addr TEXT NOT NULL, subject TEXT NOT NULL, application_id TEXT NOT NULL, event_at TEXT);`

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-thread-'))
  file = path.join(dir, 'satellite.db')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function seed(sql: string) {
  const db = new Database(file)
  db.exec(sql)
  db.close()
}

const OLD_ROWS = `INSERT INTO mail_seen (message_id, at, from_addr, subject, handled_as, application_id) VALUES
  ('m1','2026-10-10T10:00:00.000Z','jobs@acme.com','Thanks','outcome','app_1'),
  ('m2','2026-10-12T10:00:00.000Z','jobs@acme.com','Again','duplicate','app_1'),
  ('m3','2026-10-13T10:00:00.000Z','x@other.com','Other','outcome','app_2'),
  ('m4','2026-10-14T10:00:00.000Z','jobs@acme.com','Claimed','pending','app_1'),
  ('m5','2026-10-14T11:00:00.000Z','jobs@linkedin.com','Alert','alert',NULL);`

describe('listMailThread', () => {
  it('reads a satellite without the new columns or mail_history', () => {
    seed(OLD_SEEN + OLD_ROWS)
    expect(listMailThread(file, 'app_1')).toEqual([
      {
        messageId: 'm2',
        at: '2026-10-12T10:00:00.000Z',
        from: 'jobs@acme.com',
        subject: 'Again',
        kind: '',
        eventAt: null,
        handledAs: 'duplicate',
        source: 'live',
      },
      {
        messageId: 'm1',
        at: '2026-10-10T10:00:00.000Z',
        from: 'jobs@acme.com',
        subject: 'Thanks',
        kind: '',
        eventAt: null,
        handledAs: 'outcome',
        source: 'live',
      },
    ])
  })

  it('reads kind and event_at, and tied none rows', () => {
    seed(
      `${OLD_SEEN}${NEW_COLUMNS}
      INSERT INTO mail_seen (message_id, at, from_addr, subject, handled_as, application_id, kind, event_at) VALUES
        ('m1','2026-10-10T10:00:00.000Z','jobs@acme.com','Invite','outcome','app_1','interview','2026-10-20T16:00:00Z'),
        ('n1','2026-10-11T10:00:00.000Z','talent@acme.com','Welcome','none','app_1','none',NULL);`,
    )
    expect(listMailThread(file, 'app_1')).toMatchObject([
      { messageId: 'n1', kind: 'none', eventAt: null, handledAs: 'none' },
      { messageId: 'm1', kind: 'interview', eventAt: '2026-10-20T16:00:00Z', handledAs: 'outcome' },
    ])
  })

  it('adds history rows the live pass does not have, newest first', () => {
    seed(
      `${OLD_SEEN}${NEW_COLUMNS}${HISTORY}${OLD_ROWS}
      INSERT INTO mail_history VALUES
        ('h1','2026-09-01T10:00:00.000Z','"Acme Talent" <talent@acme.com>','Applied','app_1',NULL),
        ('h2','2026-10-11T10:00:00.000Z','Acme <a@acme.com>','Call','app_1','2026-10-15T15:00:00Z'),
        ('m1','2026-10-10T10:00:00.000Z','jobs@acme.com','Dup of live','app_1',NULL),
        ('h3','2026-10-11T10:00:00.000Z','x@other.com','Other app','app_2',NULL);`,
    )
    const items = listMailThread(file, 'app_1')
    expect(items.map((i) => [i.messageId, i.source])).toEqual([
      ['m2', 'live'],
      ['h2', 'history'],
      ['m1', 'live'],
      ['h1', 'history'],
    ])
    expect(items[1]).toEqual({
      messageId: 'h2',
      at: '2026-10-11T10:00:00.000Z',
      from: 'Acme <a@acme.com>',
      subject: 'Call',
      kind: '',
      eventAt: '2026-10-15T15:00:00Z',
      handledAs: null,
      source: 'history',
    })
    expect(items.find((i) => i.messageId === 'm1')?.subject).toBe('Thanks')
  })

  it('reads mail_history even when mail_seen is the old shape', () => {
    seed(`${OLD_SEEN}${HISTORY}
      INSERT INTO mail_history VALUES ('h1','2026-09-01T10:00:00.000Z','a@acme.com','Applied','app_1',NULL);`)
    expect(listMailThread(file, 'app_1').map((i) => i.messageId)).toEqual(['h1'])
  })

  it('is empty without a file or without mail_seen', () => {
    expect(listMailThread(path.join(dir, 'missing.db'), 'app_1')).toEqual([])
    seed('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);')
    expect(listMailThread(file, 'app_1')).toEqual([])
  })

  it('never writes to the satellite file', () => {
    seed(OLD_SEEN + OLD_ROWS)
    listMailThread(file, 'app_1')
    const db = new Database(file, { readonly: true })
    const cols = (db.prepare('PRAGMA table_info(mail_seen)').all() as { name: string }[]).map(
      (c) => c.name,
    )
    db.close()
    expect(cols).not.toContain('kind')
  })
})
