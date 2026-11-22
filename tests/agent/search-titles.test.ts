import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentRelevance, isRelevantTitle } from '@/lib/agent/relevance'
import { normalizeSearchTitles, recentPostingTitles } from '@/lib/agent/search-titles'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { applications } from '@/lib/db/schema'
import { readSearchTitles, writeSearchTitles } from '@/lib/satellite/search-titles'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('normalizeSearchTitles', () => {
  it('trims, drops blanks, dedupes case-insensitively and keeps the order given', () => {
    expect(
      normalizeSearchTitles([' Growth Lead ', '', 'PPC Specialist', 'growth lead', 'CRM Manager']),
    ).toEqual({ ok: true, titles: ['Growth Lead', 'PPC Specialist', 'CRM Manager'] })
  })

  it('refuses more than 30, a title over 80 characters, and anything not a list of strings', () => {
    expect(normalizeSearchTitles(Array.from({ length: 31 }, (_, i) => `t${i}`))).toEqual({
      ok: false,
      code: 'titles-too-many',
    })
    expect(normalizeSearchTitles(Array.from({ length: 30 }, (_, i) => `t${i}`))).toMatchObject({
      ok: true,
    })
    expect(normalizeSearchTitles(['x'.repeat(81)])).toEqual({ ok: false, code: 'title-too-long' })
    expect(normalizeSearchTitles('Growth')).toEqual({ ok: false, code: 'invalid-request' })
    expect(normalizeSearchTitles([null])).toEqual({ ok: false, code: 'invalid-request' })
  })
})

describe('agentRelevance — one rule for the agent and the preview', () => {
  it('uses the agent titles when there are any, else the profile titles, plus search keywords', () => {
    const own = agentRelevance({
      searchTitles: ['PPC Specialist'],
      profileTitles: ['Marketing Lead'],
      keywords: ['automation'],
    })
    expect(isRelevantTitle('Especialista en PPC', own)).toBe(true)
    expect(isRelevantTitle('Gerente de Mercadotecnia', own)).toBe(false)
    expect(isRelevantTitle('Automation Engineer', own)).toBe(true)
    const fallback = agentRelevance({
      searchTitles: [],
      profileTitles: ['Marketing Lead'],
      keywords: [],
    })
    expect(isRelevantTitle('Gerente de Mercadotecnia', fallback)).toBe(true)
  })
})

let dir: string
let satFile: string
const sat = () => new Database(satFile)

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-titles-'))
  satFile = path.join(dir, 'sat.db')
  const db = sat()
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
    CREATE TABLE shown_postings (posting_id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE judged_postings (posting_id TEXT PRIMARY KEY NOT NULL, verdict TEXT NOT NULL, judged_at TEXT NOT NULL, title TEXT);`)
  db.close()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('searchTitles setting (ruling I2)', () => {
  it('absent: seeded once from the profile titles, then the stored list wins', () => {
    expect(readSearchTitles(satFile, ['Growth Lead'])).toEqual(['Growth Lead'])
    expect(readSearchTitles(satFile, ['Something else'])).toEqual(['Growth Lead'])
    const db = sat()
    expect(db.prepare("SELECT value FROM settings WHERE key = 'searchTitles'").get()).toEqual({
      value: '["Growth Lead"]',
    })
    db.close()
  })

  it('a write replaces the list (empty included) and is logged as an Ajustes change', () => {
    writeSearchTitles(satFile, ['PPC Specialist', 'Paid Media'])
    expect(readSearchTitles(satFile, ['Profile'])).toEqual(['PPC Specialist', 'Paid Media'])
    writeSearchTitles(satFile, [])
    expect(readSearchTitles(satFile, ['Profile'])).toEqual([])
    const db = sat()
    const logs = db.prepare("SELECT detail FROM run_log WHERE event = 'setting-changed'").all()
    db.close()
    expect(logs).toEqual([
      { detail: 'searchTitles=["PPC Specialist","Paid Media"] (cvforge)' },
      { detail: 'searchTitles=[] (cvforge)' },
    ])
  })
})

describe('recentPostingTitles', () => {
  let cv: Db
  let closeCv: () => void
  beforeEach(() => {
    const opened = openDb(path.join(dir, 'cv.db'))
    runMigrations(opened.db)
    cv = opened.db
    closeCv = opened.close
    const db = sat()
    const put = db.prepare('INSERT INTO shown_postings VALUES (?, ?, ?)')
    put.run('p1', JSON.stringify({ jobTitle: 'SEO Specialist' }), '2026-10-15T10:00:00.000Z')
    put.run('p2', JSON.stringify({ jobTitle: 'Growth Lead' }), '2026-10-12T10:00:00.000Z')
    put.run('p3', '{not json', '2026-10-16T10:00:00.000Z')
    db.close()
  })
  afterEach(() => closeCv())

  const app = (id: string, jobTitle: string, createdAt: string, archived = false) =>
    cv
      .insert(applications)
      .values({
        id,
        source: 'linkedin',
        company: 'X',
        jobTitle,
        market: 'mx',
        documentLanguage: 'es-MX',
        postingRaw: 'p',
        postingHash: id,
        createdAt,
        archived,
      })
      .run()

  it('merges finds and applications, newest first, distinct, unreadable rows skipped', () => {
    app('a1', 'Account Manager', '2026-10-14 09:00:00', true)
    app('a2', 'growth lead', '2026-10-10 09:00:00')
    expect(recentPostingTitles(satFile, cv)).toEqual([
      'SEO Specialist',
      'Account Manager',
      'Growth Lead',
    ])
  })

  it('M7: includes what the screen dropped, even when newer kept postings would fill the 12', () => {
    for (let i = 0; i < 15; i++)
      app(`b${i}`, `Role ${i}`, `2026-10-${String(i + 1).padStart(2, '0')} 09:00:00`)
    const db = sat()
    const judged = db.prepare('INSERT INTO judged_postings VALUES (?, ?, ?, ?)')
    judged.run('d1', 'drop:not-relevant', '2026-09-01T00:00:00.000Z', 'Account Executive')
    judged.run('d2', 'drop:too-junior', '2026-09-02T00:00:00.000Z', 'Marketing Intern')
    judged.run('d3', 'drop:not-relevant', '2026-09-03T00:00:00.000Z', null)
    db.close()
    const out = recentPostingTitles(satFile, cv)
    expect(out).toHaveLength(12)
    expect(out).toContain('Account Executive')
    expect(out).toContain('Marketing Intern')
    expect(out[0]).toBe('SEO Specialist')
  })

  it('an older agent (no title column) or no agent database: the rest alone', () => {
    app('a1', 'Account Manager', '2026-10-14 09:00:00')
    const db = sat()
    db.exec(
      'DROP TABLE judged_postings; CREATE TABLE judged_postings (posting_id TEXT, verdict TEXT, judged_at TEXT)',
    )
    db.close()
    expect(recentPostingTitles(satFile, cv)).toContain('Account Manager')
    expect(recentPostingTitles(undefined, cv)).toEqual(['Account Manager'])
    expect(recentPostingTitles(path.join(dir, 'missing.db'), cv)).toEqual(['Account Manager'])
  })
})

describe('saveSearchTitlesAction', () => {
  beforeEach(() => {
    process.env.CVFORGE_SATELLITE_DB_PATH = satFile
    process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  })
  afterEach(() => {
    delete process.env.CVFORGE_SATELLITE_DB_PATH
    delete process.env.CVFORGE_CONFIG_PATH
    delete process.env.CVFORGE_MODE
  })
  const action = async () => (await import('@/app/(app)/settings/actions')).saveSearchTitlesAction

  it('writes the agent setting, in order, normalised — never the profile', async () => {
    const save = await action()
    expect(await save([' PPC Specialist ', 'Growth Lead', 'ppc specialist'])).toEqual({
      ok: true,
      titles: ['PPC Specialist', 'Growth Lead'],
    })
    expect(readSearchTitles(satFile, [])).toEqual(['PPC Specialist', 'Growth Lead'])
  })

  it('refuses over the limits, without an agent, and in the demo', async () => {
    const save = await action()
    expect(await save(['x'.repeat(81)])).toMatchObject({ ok: false, code: 'title-too-long' })
    process.env.CVFORGE_MODE = 'demo'
    expect(await save(['Growth'])).toMatchObject({ ok: false, code: 'demo-read-only' })
    delete process.env.CVFORGE_MODE
    process.env.CVFORGE_SATELLITE_DB_PATH = path.join(dir, 'missing.db')
    expect(await save(['Growth'])).toMatchObject({ ok: false, code: 'agent-unavailable' })
  })
})
