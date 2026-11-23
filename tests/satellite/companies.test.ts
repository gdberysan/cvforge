import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addCompany,
  deleteCompany,
  readCompanies,
  setCompanyEnabled,
} from '@/lib/satellite/companies'

const RUN_LOG = `CREATE TABLE IF NOT EXISTS run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');`
const COMPANIES = `CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, site TEXT NOT NULL, board TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, added_at TEXT NOT NULL, last_checked_at TEXT, last_status TEXT, open_roles INTEGER, backfilled INTEGER NOT NULL DEFAULT 0, UNIQUE(site, board));`

let dir: string
let file: string
const setup = (withTable: boolean) => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-companies-'))
  file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.exec(RUN_LOG + (withTable ? COMPANIES : ''))
  db.close()
}
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const log = () => {
  const db = new Database(file)
  try {
    return db.prepare('SELECT event, detail FROM run_log').all()
  } finally {
    db.close()
  }
}

describe('followed companies', () => {
  beforeEach(() => setup(true))

  it('adds with a c-<base36> id, rejects a duplicate site/board', () => {
    const out = addCompany(file, { name: 'Acme', site: 'lever', board: 'acme' }, 1_700_000_000_000)
    expect(out).toMatchObject({
      ok: true,
      company: {
        id: `c-${(1_700_000_000_000).toString(36)}`,
        name: 'Acme',
        enabled: true,
        openRoles: null,
      },
    })
    expect(readCompanies(file)).toHaveLength(1)
    expect(addCompany(file, { name: 'Acme 2', site: 'lever', board: 'ACME' })).toEqual({
      ok: false,
      code: 'company-duplicate',
    })
    expect(addCompany(file, { name: 'Acme', site: 'ashby', board: 'acme' }).ok).toBe(true)
    expect(addCompany(file, { name: ' ', site: 'ashby', board: 'x' })).toEqual({
      ok: false,
      code: 'company-invalid',
    })
  })

  it('toggles and deletes, each logged with the ajustes suffix', () => {
    const added = addCompany(file, { name: 'Acme', site: 'lever', board: 'acme' })
    const id = added.ok ? added.company.id : ''
    expect(setCompanyEnabled(file, id, false)).toEqual({ ok: true })
    expect(readCompanies(file)?.[0].enabled).toBe(false)
    expect(deleteCompany(file, id)).toEqual({ ok: true })
    expect(deleteCompany(file, id)).toEqual({ ok: false, code: 'company-gone' })
    expect(setCompanyEnabled(file, id, true)).toEqual({ ok: false, code: 'company-gone' })
    expect(log()).toEqual([
      { event: 'company-added', detail: 'Acme (lever/acme) (ajustes)' },
      { event: 'company-toggled', detail: 'Acme=false (ajustes)' },
      { event: 'company-deleted', detail: 'Acme (ajustes)' },
    ])
  })

  it('reads the agent’s status columns', () => {
    const db = new Database(file)
    db.prepare(
      "INSERT INTO companies (id, name, site, board, added_at, last_checked_at, last_status, open_roles) VALUES ('c-1','A','lever','a','x','2026-10-16T00:00:00Z','not-found',3)",
    ).run()
    db.close()
    expect(readCompanies(file)).toEqual([
      {
        id: 'c-1',
        name: 'A',
        site: 'lever',
        board: 'a',
        enabled: true,
        lastCheckedAt: '2026-10-16T00:00:00Z',
        lastStatus: 'not-found',
        openRoles: 3,
      },
    ])
  })
})

describe('an agent that has not been restarted', () => {
  beforeEach(() => setup(false))
  it('reads null and refuses writes as agent-outdated', () => {
    expect(readCompanies(file)).toBeNull()
    expect(addCompany(file, { name: 'Acme', site: 'lever', board: 'acme' })).toEqual({
      ok: false,
      code: 'agent-outdated',
    })
    expect(setCompanyEnabled(file, 'c-1', true)).toEqual({ ok: false, code: 'agent-outdated' })
  })
})
