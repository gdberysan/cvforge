import Database from 'better-sqlite3'

/**
 * The Gmail side of the job agent, as Ajustes and Hoy see it (spec
 * 2026-10-16 agent stage B §2, §4). The satellite owns `mail_seen`,
 * `mail_suggestions` and the `gmail-*` settings rows; CVForge reads them,
 * closes a suggestion, flips the three switches and writes the disconnect
 * request. A satellite that has not been restarted on a build with these
 * tables is not an error: every read degrades to "nothing" / "never".
 */
export type MailSuggestion = {
  id: string
  messageId: string
  at: string
  from: string
  subject: string
  quote: string
  kind: string
  candidateAppIds: string[]
}

export type MailStatus = {
  state: 'connected' | 'revoked' | 'disconnected' | 'never' | 'disconnecting'
  account: string | null
  readAt: string | null
  alerts: boolean
  outcomes: boolean
  drafts: boolean
}

export type MailSwitchKey = 'mailAlerts' | 'mailOutcomes' | 'mailDrafts'

function withDb<T>(file: string, fn: (db: Database.Database) => T): T {
  const db = new Database(file, { fileMustExist: true })
  try {
    // The agent may be mid-scan, writing these rows.
    db.pragma('busy_timeout = 5000')
    return fn(db)
  } finally {
    db.close()
  }
}

type Row = {
  id: string
  message_id: string
  at: string
  from_addr: string
  subject: string
  quote: string
  kind: string
  candidate_app_ids: string
}

const COLUMNS = 'id, message_id, at, from_addr, subject, quote, kind, candidate_app_ids'

function shape(r: Row): MailSuggestion {
  let ids: string[] = []
  try {
    const parsed: unknown = JSON.parse(r.candidate_app_ids)
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    // An unreadable list reads as untied: the card offers every waiting application.
  }
  return {
    id: r.id,
    messageId: r.message_id,
    at: r.at,
    from: r.from_addr,
    subject: r.subject,
    quote: r.quote,
    kind: r.kind,
    candidateAppIds: ids,
  }
}

/** Open suggestions, newest first; [] when the file or the table is missing. */
export function listMailSuggestions(file: string): MailSuggestion[] {
  try {
    return withDb(file, (db) =>
      (
        db
          .prepare(`SELECT ${COLUMNS} FROM mail_suggestions WHERE status = 'open' ORDER BY at DESC`)
          .all() as Row[]
      ).map(shape),
    )
  } catch {
    return []
  }
}

export function getMailSuggestion(file: string, id: string): MailSuggestion | null {
  try {
    return withDb(file, (db) => {
      const r = db
        .prepare(`SELECT ${COLUMNS} FROM mail_suggestions WHERE id = ? AND status = 'open'`)
        .get(id) as Row | undefined
      return r ? shape(r) : null
    })
  } catch {
    return null
  }
}

/** True only when an open suggestion was closed by this call. */
export function closeMailSuggestion(
  file: string,
  id: string,
  status: 'accepted' | 'dismissed',
): boolean {
  try {
    return withDb(
      file,
      (db) =>
        db
          .prepare("UPDATE mail_suggestions SET status = ? WHERE id = ? AND status = 'open'")
          .run(status, id).changes > 0,
    )
  } catch {
    return false
  }
}

/** Undoes a close made by an accept whose outcome could not be written. */
export function reopenMailSuggestion(file: string, id: string): void {
  try {
    withDb(file, (db) =>
      db.prepare("UPDATE mail_suggestions SET status = 'open' WHERE id = ?").run(id),
    )
  } catch {
    // Nothing more can be done; the card stays closed rather than the write doubled.
  }
}

/**
 * After a Hoy accept: the satellite's `mail_seen` row for that message now
 * says what the outcome pass would have written for a tied reply
 * (`handled_as = 'outcome'`, the application), so the follow-up draft can
 * address the sender and quote the note. Never throws: a missing file or
 * table (a satellite not yet restarted) leaves the draft without a
 * recipient, nothing worse.
 */
export function markMailOutcome(
  file: string,
  mail: Pick<MailSuggestion, 'messageId' | 'at' | 'from' | 'subject'>,
  applicationId: string,
): void {
  try {
    withDb(file, (db) => {
      const changed = db
        .prepare(
          "UPDATE mail_seen SET handled_as = 'outcome', application_id = ? WHERE message_id = ?",
        )
        .run(applicationId, mail.messageId).changes
      if (changed === 0) {
        db.prepare(
          "INSERT OR IGNORE INTO mail_seen (message_id, at, from_addr, subject, handled_as, application_id) VALUES (?, ?, ?, ?, 'outcome', ?)",
        ).run(mail.messageId, mail.at, mail.from, mail.subject, applicationId)
      }
    })
  } catch {
    // The outcome is written; the draft just goes out without a recipient.
  }
}

/**
 * One email the agent tied to an application (spec 2026-10-17 §1.3.2):
 * a live-pass row from `mail_seen`, or a `mail_history` row from the
 * one-time import. `from` is whatever the satellite stored — the live pass
 * keeps the bare address, a Hoy accept or the import may keep the whole
 * `Name <addr>` header. `kind` is the classified kind ('' when the satellite
 * predates the column or never classified it); `handledAs` is null for
 * history rows, which were never classified.
 */
export type MailThreadItem = {
  messageId: string
  at: string
  from: string
  subject: string
  kind: string
  eventAt: string | null
  handledAs: string | null
  source: 'live' | 'history'
}

function columnsOf(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  )
}

type ThreadRow = {
  message_id: string
  at: string
  from_addr: string | null
  subject: string | null
  kind: string | null
  event_at: string | null
  handled_as?: string | null
}

const toItem = (r: ThreadRow, source: MailThreadItem['source']): MailThreadItem => ({
  messageId: r.message_id,
  at: r.at,
  from: r.from_addr ?? '',
  subject: r.subject ?? '',
  kind: r.kind ?? '',
  eventAt: r.event_at || null,
  handledAs: source === 'live' ? (r.handled_as ?? null) : null,
  source,
})

/**
 * Every email tied to one application, newest first: `mail_seen` rows with
 * that `application_id` (a claim still `pending` is not settled yet and is
 * left out), then `mail_history` rows whose message the live pass has not
 * already got. Degrades per piece: a satellite without `kind`/`event_at`
 * reads '' / null for them, one without `mail_history` gives live rows only,
 * and no file or no `mail_seen` gives []. Never throws.
 */
export function listMailThread(file: string, applicationId: string): MailThreadItem[] {
  try {
    return withDb(file, (db) => {
      const items: MailThreadItem[] = []
      const seen = columnsOf(db, 'mail_seen')
      if (seen.has('application_id')) {
        const kind = seen.has('kind') ? 'kind' : "'' AS kind"
        const eventAt = seen.has('event_at') ? 'event_at' : 'NULL AS event_at'
        const rows = db
          .prepare(
            `SELECT message_id, at, from_addr, subject, handled_as, ${kind}, ${eventAt}
             FROM mail_seen WHERE application_id = ? AND handled_as <> 'pending'`,
          )
          .all(applicationId) as ThreadRow[]
        for (const r of rows) items.push(toItem(r, 'live'))
      }
      const history = columnsOf(db, 'mail_history')
      if (history.has('application_id')) {
        const eventAt = history.has('event_at') ? 'event_at' : 'NULL AS event_at'
        const have = new Set(items.map((i) => i.messageId))
        const rows = db
          .prepare(
            `SELECT message_id, at, from_addr, subject, '' AS kind, ${eventAt}
             FROM mail_history WHERE application_id = ?`,
          )
          .all(applicationId) as ThreadRow[]
        for (const r of rows) if (!have.has(r.message_id)) items.push(toItem(r, 'history'))
      }
      return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    })
  } catch {
    return []
  }
}

const GMAIL = {
  state: 'gmail-state',
  account: 'gmail-account',
  readAt: 'gmail-read-at',
  disconnect: 'gmail-disconnect-requested',
} as const

const NEVER: MailStatus = {
  state: 'never',
  account: null,
  readAt: null,
  alerts: true,
  outcomes: true,
  drafts: true,
}

/** Never throws: no file, no `settings` table or a garbled row all read as "never connected". */
export function readMailStatus(file: string): MailStatus {
  try {
    return withDb(file, (db) => {
      const stored: Record<string, unknown> = {}
      for (const r of db.prepare('SELECT key, value FROM settings').all() as {
        key: string
        value: string
      }[]) {
        try {
          stored[r.key] = JSON.parse(r.value)
        } catch {
          // A row this code did not write and cannot read keeps its default.
        }
      }
      const s = stored[GMAIL.state]
      const known = s === 'connected' || s === 'revoked' || s === 'disconnected'
      const account = stored[GMAIL.account]
      const readAt = stored[GMAIL.readAt]
      const on = (k: MailSwitchKey) => (typeof stored[k] === 'boolean' ? stored[k] : true)
      return {
        state:
          stored[GMAIL.disconnect] === true && s === 'connected'
            ? 'disconnecting'
            : known
              ? s
              : 'never',
        account: typeof account === 'string' && account ? account : null,
        readAt: typeof readAt === 'string' && readAt ? readAt : null,
        alerts: on('mailAlerts') as boolean,
        outcomes: on('mailOutcomes') as boolean,
        drafts: on('mailDrafts') as boolean,
      }
    })
  } catch {
    return NEVER
  }
}

const upsert =
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'

/** A JSON boolean in the satellite's `settings`, the way writeAgentSettings stores one. */
export function setMailSwitch(file: string, key: MailSwitchKey, on: boolean): void {
  withDb(file, (db) => {
    db.prepare(upsert).run(key, JSON.stringify(on))
    try {
      db.prepare('INSERT INTO run_log (at, event, detail) VALUES (?, ?, ?)').run(
        new Date().toISOString(),
        'setting-changed',
        `${key}=${JSON.stringify(on)} (cvforge)`,
      )
    } catch {
      // The change is what matters; the log line is a courtesy.
    }
  })
}

/** Ajustes' Desconectar: the satellite's next tick removes the token and clears this. */
export function requestGmailDisconnect(file: string): void {
  withDb(file, (db) => {
    db.prepare(upsert).run(GMAIL.disconnect, 'true')
  })
}
