import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCompanies } from '@/lib/satellite/companies'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-company-act-'))
  file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.exec(`CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, site TEXT NOT NULL, board TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, added_at TEXT NOT NULL, last_checked_at TEXT, last_status TEXT, open_roles INTEGER, backfilled INTEGER NOT NULL DEFAULT 0, UNIQUE(site, board));
    CREATE TABLE run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');`)
  db.close()
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  process.env.CVFORGE_SATELLITE_DB_PATH = file
})
afterEach(() => {
  delete process.env.CVFORGE_CONFIG_PATH
  delete process.env.CVFORGE_SATELLITE_DB_PATH
  delete process.env.CVFORGE_MODE
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

const actions = () => import('@/app/(app)/settings/actions')

describe('company actions', () => {
  it('a careers URL adds without any network', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { addCompanyAction, toggleCompanyAction, deleteCompanyAction } = await actions()
    const out = await addCompanyAction({ nameOrUrl: 'https://jobs.lever.co/acme' })
    expect(out).toMatchObject({ ok: true, company: { name: 'Acme', site: 'lever', board: 'acme' } })
    expect(f).not.toHaveBeenCalled()
    const id = readCompanies(file)?.[0].id ?? ''
    expect(await toggleCompanyAction(id, false)).toEqual({ ok: true })
    expect(await deleteCompanyAction(id)).toEqual({ ok: true })
    expect(await addCompanyAction({ nameOrUrl: 'https://jobs.lever.co/acme' })).toMatchObject({
      ok: true,
    })
    expect(await addCompanyAction({ nameOrUrl: 'https://jobs.lever.co/acme' })).toMatchObject({
      ok: false,
      code: 'company-duplicate',
    })
  })

  it('a name is probed; found is added under the typed name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('ashbyhq')
          ? ({ status: 200, json: async () => ({ jobs: [{}] }) } as Response)
          : ({ status: 404, json: async () => ({}) } as Response),
      ),
    )
    const { addCompanyAction } = await actions()
    expect(await addCompanyAction({ nameOrUrl: 'Hugging Face' })).toMatchObject({
      ok: true,
      company: { name: 'Hugging Face', site: 'ashby', board: 'huggingface' },
    })
  })

  it('reads a URL without its scheme; probes a dotted name that is no known host', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('lever.co')
        ? ({ status: 200, json: async () => [{}] } as Response)
        : ({ status: 404, json: async () => ({}) } as Response),
    )
    vi.stubGlobal('fetch', f)
    const { addCompanyAction } = await actions()
    expect(await addCompanyAction({ nameOrUrl: 'jobs.ashbyhq.com/zed' })).toMatchObject({
      ok: true,
      company: { site: 'ashby', board: 'zed' },
    })
    expect(f).not.toHaveBeenCalled()
    expect(await addCompanyAction({ nameOrUrl: 'Monday.com' })).toMatchObject({
      ok: true,
      company: { name: 'Monday.com', site: 'lever', board: 'mondaycom' },
    })
  })

  it('a vanished row says company-gone; a missing table is caught before probing', async () => {
    const { toggleCompanyAction, deleteCompanyAction, addCompanyAction } = await actions()
    expect(await toggleCompanyAction('c-zz', true)).toMatchObject({ code: 'company-gone' })
    expect(await deleteCompanyAction('c-zz')).toMatchObject({ code: 'company-gone' })
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const db = new Database(file)
    db.exec('DROP TABLE companies')
    db.close()
    expect(await addCompanyAction({ nameOrUrl: 'Acme' })).toMatchObject({ code: 'agent-outdated' })
    expect(f).not.toHaveBeenCalled()
  })

  it('refuses an unknown URL, an unfindable name, and an empty field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 404, json: async () => ({}) }) as Response),
    )
    const { addCompanyAction } = await actions()
    expect(await addCompanyAction({ nameOrUrl: 'https://acme.com/careers' })).toMatchObject({
      ok: false,
      code: 'company-url-unknown',
    })
    expect(await addCompanyAction({ nameOrUrl: 'Nobody Inc' })).toMatchObject({
      ok: false,
      code: 'company-not-found',
    })
    expect(await addCompanyAction({ nameOrUrl: '  ' })).toMatchObject({
      ok: false,
      code: 'company-invalid',
    })
  })

  it('says agent-unavailable without the file, and is blocked in the demo', async () => {
    process.env.CVFORGE_SATELLITE_DB_PATH = path.join(dir, 'missing.db')
    const { addCompanyAction, toggleCompanyAction, deleteCompanyAction } = await actions()
    expect(await addCompanyAction({ nameOrUrl: 'https://jobs.lever.co/acme' })).toMatchObject({
      ok: false,
      code: 'agent-unavailable',
    })
    expect(await toggleCompanyAction('c-1', true)).toMatchObject({ code: 'agent-unavailable' })
    expect(await deleteCompanyAction('c-1')).toMatchObject({ code: 'agent-unavailable' })
    process.env.CVFORGE_MODE = 'demo'
    const { demoBlock } = await import('@/lib/demo/mode')
    expect(await addCompanyAction({ nameOrUrl: 'x' })).toEqual(demoBlock())
  })

  it('an agent database that cannot be read says agent-unavailable, never throws', async () => {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      file,
      'this is not a sqlite database, just text long enough to be read'.repeat(20),
    )
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { addCompanyAction } = await actions()
    expect(await addCompanyAction({ nameOrUrl: 'Acme' })).toMatchObject({
      ok: false,
      code: 'agent-unavailable',
    })
    expect(f).not.toHaveBeenCalled()
  })
})
