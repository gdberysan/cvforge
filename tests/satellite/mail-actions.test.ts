import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, runMigrations } from '@/lib/db/client'
import {
  appendOutcome,
  createApplication,
  getApplication,
  listMailOutcomes,
  setArchived,
} from '@/lib/db/queries/applications'
import { listMailSuggestions } from '@/lib/satellite/mail'

const holder = vi.hoisted(() => ({ db: null as unknown, failWrite: false }))
vi.mock('@/lib/db/queries/applications', async (orig) => {
  const real = await orig<typeof import('@/lib/db/queries/applications')>()
  return {
    ...real,
    appendOutcome: (...a: Parameters<typeof real.appendOutcome>) => {
      if (holder.failWrite) throw new Error('disk full')
      return real.appendOutcome(...a)
    },
  }
})
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  get db() {
    return holder.db
  },
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

let dir: string
let file: string
let close: () => void
let waiting: string
let archivedApp: string

const base = {
  source: 'linkedin' as const,
  company: 'Acme',
  jobTitle: 'Eng',
  market: 'us-remote' as const,
  documentLanguage: 'en' as const,
  postingRaw: 'x',
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
    verdict: 'stretch' as const,
  },
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mail-act-'))
  file = path.join(dir, 'satellite.db')
  const sat = new Database(file)
  sat.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS mail_suggestions (id TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL, from_addr TEXT NOT NULL, subject TEXT NOT NULL, quote TEXT NOT NULL, kind TEXT NOT NULL, candidate_app_ids TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open');
    CREATE TABLE mail_seen (message_id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, from_addr TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', handled_as TEXT NOT NULL, application_id TEXT, claimed_at TEXT);
    INSERT INTO mail_suggestions VALUES ('s1','msg-1','2026-10-12T15:30:00.000Z','hr@acme.com','Re: your application','Seguimos con otros perfiles.','rejected','[]','open');
    INSERT INTO mail_seen (message_id, at, from_addr, subject, handled_as) VALUES ('msg-1','2026-10-12T15:30:00.000Z','hr@acme.com','Re: your application','suggestion');`)
  sat.close()
  process.env.CVFORGE_SATELLITE_DB_PATH = file
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')

  const opened = openDb(path.join(dir, 'cv.db'))
  runMigrations(opened.db)
  holder.db = opened.db
  close = opened.close
  waiting = createApplication(opened.db, { ...base, postingHash: 'h1' })
  appendOutcome(opened.db, waiting, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
  archivedApp = createApplication(opened.db, { ...base, postingHash: 'h2' })
  revalidatePath.mockClear()
  holder.failWrite = false
})
afterEach(() => {
  close()
  delete process.env.CVFORGE_SATELLITE_DB_PATH
  delete process.env.CVFORGE_CONFIG_PATH
  delete process.env.CVFORGE_MODE
  rmSync(dir, { recursive: true, force: true })
})

const agent = () => import('@/app/(app)/agent/actions')
const pipeline = () => import('@/app/(app)/pipeline/actions')
const settings = () => import('@/app/(app)/settings/actions')

describe('every mail action is blocked in the demo', () => {
  it('returns demoBlock before touching anything', async () => {
    process.env.CVFORGE_MODE = 'demo'
    const a = await agent()
    const p = await pipeline()
    const s = await settings()
    for (const out of [
      await a.acceptMailSuggestionAction('s1', waiting, 'rejected'),
      await a.dismissMailSuggestionAction('s1'),
      await p.undoMailOutcomeAction(waiting, 'x'),
      await s.setMailSwitchAction('mailAlerts', false),
      await s.disconnectGmailAction(),
    ]) {
      expect(out).toMatchObject({ ok: false, code: 'demo-read-only' })
    }
    expect(listMailSuggestions(file)).toHaveLength(1)
  })
})

describe('acceptMailSuggestionAction', () => {
  it('writes the outcome with the email date and note, closes the suggestion, revalidates /', async () => {
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'rejected')).toEqual({ ok: true })
    const app = getApplication(holder.db as never, waiting)
    expect(app?.outcomes.at(-1)).toEqual({
      at: '2026-10-12T15:30:00.000Z',
      type: 'rejected',
      note: 'gmail:msg-1 «Seguimos con otros perfiles.»',
    })
    expect(app?.status).toBe('closed')
    expect(listMailSuggestions(file)).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/')
    // …and Undo can reach exactly that event.
    expect(listMailOutcomes(holder.db as never, waiting)).toHaveLength(1)
  })

  it('refuses an application that is not waiting, and an unknown outcome', async () => {
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', archivedApp, 'rejected')).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    expect(await acceptMailSuggestionAction('s1', 'nope', 'rejected')).toMatchObject({
      code: 'invalid',
    })
    expect(await acceptMailSuggestionAction('s1', waiting, 'applied')).toMatchObject({
      code: 'invalid',
    })
    expect(listMailSuggestions(file)).toHaveLength(1)
  })

  it('a suggestion already handled is gone', async () => {
    const { acceptMailSuggestionAction, dismissMailSuggestionAction } = await agent()
    expect(await dismissMailSuggestionAction('s1')).toEqual({ ok: true })
    expect(await dismissMailSuggestionAction('s1')).toMatchObject({ code: 'gone' })
    expect(await acceptMailSuggestionAction('s1', waiting, 'offer')).toMatchObject({ code: 'gone' })
  })
})

describe('accept hardening', () => {
  it('an unreadable email date is refused: no outcome, the suggestion stays open', async () => {
    const sat = new Database(file)
    sat.prepare("UPDATE mail_suggestions SET at = 'yesterday-ish'").run()
    sat.close()
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'rejected')).toMatchObject({
      ok: false,
      code: 'bad-date',
    })
    expect(listMailOutcomes(holder.db as never, waiting)).toEqual([])
    expect(getApplication(holder.db as never, waiting)?.outcomes).toHaveLength(1)
    expect(listMailSuggestions(file)).toHaveLength(1)
  })

  it('a date Date.parse would accept but that is not ISO is refused too', async () => {
    const sat = new Database(file)
    sat.prepare("UPDATE mail_suggestions SET at = 'Oct 12, 2026'").run()
    sat.close()
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'offer')).toMatchObject({
      code: 'bad-date',
    })
  })

  it('an impossible calendar date is refused (2026-02-30 must not become March 2)', async () => {
    const sat = new Database(file)
    sat.prepare("UPDATE mail_suggestions SET at = '2026-02-30T10:00:00Z'").run()
    sat.close()
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'rejected')).toMatchObject({
      code: 'bad-date',
    })
    expect(listMailSuggestions(file)).toHaveLength(1)
  })

  it('when the outcome write throws, the error surfaces and the suggestion is open again', async () => {
    const { acceptMailSuggestionAction } = await agent()
    holder.failWrite = true
    await expect(acceptMailSuggestionAction('s1', waiting, 'rejected')).rejects.toThrow('disk full')
    expect(listMailSuggestions(file).map((s) => s.id)).toEqual(['s1'])
    holder.failWrite = false
    expect(await acceptMailSuggestionAction('s1', waiting, 'rejected')).toEqual({ ok: true })
  })

  it('two concurrent accepts write one outcome', async () => {
    const { acceptMailSuggestionAction } = await agent()
    const outs = await Promise.all([
      acceptMailSuggestionAction('s1', waiting, 'screen'),
      acceptMailSuggestionAction('s1', waiting, 'screen'),
    ])
    expect(outs.filter((o) => o.ok)).toHaveLength(1)
    expect(outs.find((o) => !o.ok)).toMatchObject({ code: 'gone' })
    expect(listMailOutcomes(holder.db as never, waiting)).toHaveLength(1)
  })
})

describe('undoMailOutcomeAction', () => {
  it('a gmail: event under another application is not found', async () => {
    const { acceptMailSuggestionAction } = await agent()
    const { undoMailOutcomeAction } = await pipeline()
    await acceptMailSuggestionAction('s1', waiting, 'rejected')
    const [mail] = listMailOutcomes(holder.db as never, waiting)
    expect(await undoMailOutcomeAction(archivedApp, mail.id)).toMatchObject({
      ok: false,
      code: 'not-found',
    })
    expect(listMailOutcomes(holder.db as never, waiting)).toHaveLength(1)
  })

  it('a hand-written note that merely resembles the prefix is not undoable', async () => {
    const { undoMailOutcomeAction } = await pipeline()
    for (const note of ['Gmail: llamé', 'GMAIL:x «q»', ' gmail:x «q»']) {
      const id = appendOutcome(holder.db as never, waiting, {
        at: '2026-10-03T00:00:00.000Z',
        type: 'screen',
        note,
      })
      expect(listMailOutcomes(holder.db as never, waiting)).toEqual([])
      expect(await undoMailOutcomeAction(waiting, id)).toMatchObject({ code: 'not-found' })
    }
  })

  it('removes a gmail: event and re-derives the status', async () => {
    const { acceptMailSuggestionAction } = await agent()
    const { undoMailOutcomeAction } = await pipeline()
    await acceptMailSuggestionAction('s1', waiting, 'rejected')
    const [mail] = listMailOutcomes(holder.db as never, waiting)
    expect(await undoMailOutcomeAction(waiting, mail.id)).toEqual({ ok: true })
    expect(getApplication(holder.db as never, waiting)?.status).toBe('applied')
    expect(listMailOutcomes(holder.db as never, waiting)).toEqual([])
  })

  it('never removes an outcome the user logged themselves', async () => {
    const { undoMailOutcomeAction } = await pipeline()
    const own = appendOutcome(holder.db as never, waiting, {
      at: '2026-10-03T00:00:00.000Z',
      type: 'screen',
    })
    expect(await undoMailOutcomeAction(waiting, own)).toMatchObject({
      ok: false,
      code: 'not-found',
    })
    expect(await undoMailOutcomeAction(waiting, 'out_missing')).toMatchObject({
      code: 'not-found',
    })
    expect(getApplication(holder.db as never, waiting)?.outcomes).toHaveLength(2)
  })
})

describe('Correo settings actions', () => {
  it('writes a switch and the disconnect request', async () => {
    const { setMailSwitchAction, disconnectGmailAction } = await settings()
    expect(await setMailSwitchAction('mailDrafts', false)).toEqual({ ok: true })
    expect(await disconnectGmailAction()).toEqual({ ok: true })
    const sat = new Database(file)
    const get = (k: string) =>
      (sat.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string }).value
    expect(get('mailDrafts')).toBe('false')
    expect(get('gmail-disconnect-requested')).toBe('true')
    sat.close()
  })

  it('refuses a key that is not one of the three switches', async () => {
    const { setMailSwitchAction } = await settings()
    expect(await setMailSwitchAction('paused', true)).toMatchObject({
      ok: false,
      code: 'invalid-request',
    })
    expect(await setMailSwitchAction('gmail-state', true)).toMatchObject({ ok: false })
  })

  it('without the agent database, says so', async () => {
    process.env.CVFORGE_SATELLITE_DB_PATH = path.join(dir, 'missing.db')
    const { setMailSwitchAction, disconnectGmailAction } = await settings()
    expect(await setMailSwitchAction('mailAlerts', true)).toMatchObject({
      code: 'agent-unavailable',
    })
    expect(await disconnectGmailAction()).toMatchObject({ code: 'agent-unavailable' })
  })
})

describe('final fix — accept ties the mail and targets only a waiting application', () => {
  const seen = () => {
    const sat = new Database(file)
    try {
      return sat
        .prepare('SELECT handled_as, application_id FROM mail_seen WHERE message_id = ?')
        .get('msg-1')
    } finally {
      sat.close()
    }
  }

  it('a successful accept stamps the mail_seen row as this application’s outcome', async () => {
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'screen')).toEqual({ ok: true })
    expect(seen()).toEqual({ handled_as: 'outcome', application_id: waiting })
  })

  it('a refused or failed accept leaves the row alone', async () => {
    const { acceptMailSuggestionAction } = await agent()
    holder.failWrite = true
    await expect(acceptMailSuggestionAction('s1', waiting, 'rejected')).rejects.toThrow('disk full')
    expect(seen()).toEqual({ handled_as: 'suggestion', application_id: null })
    holder.failWrite = false
  })

  it('a satellite without mail_seen does not fail the accept', async () => {
    const sat = new Database(file)
    sat.exec('DROP TABLE mail_seen')
    sat.close()
    const { acceptMailSuggestionAction } = await agent()
    expect(await acceptMailSuggestionAction('s1', waiting, 'screen')).toEqual({ ok: true })
  })

  it('refuses an archived application, and one with no applied outcome', async () => {
    const { acceptMailSuggestionAction } = await agent()
    const noApplied = createApplication(holder.db as never, { ...base, postingHash: 'h3' })
    appendOutcome(holder.db as never, noApplied, { at: '2026-10-02T00:00:00.000Z', type: 'screen' })
    expect(getApplication(holder.db as never, noApplied)?.status).toBe('interviewing')
    expect(await acceptMailSuggestionAction('s1', noApplied, 'offer')).toMatchObject({
      code: 'invalid',
    })
    setArchived(holder.db as never, waiting, true)
    expect(await acceptMailSuggestionAction('s1', waiting, 'offer')).toMatchObject({
      code: 'invalid',
    })
    expect(listMailSuggestions(file)).toHaveLength(1)
  })
})
