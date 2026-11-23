import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSearches } from '@/lib/satellite/searches'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sat-search-act-'))
  file = path.join(dir, 'satellite.db')
  const db = new Database(file)
  db.exec(`CREATE TABLE searches (id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, keywords TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '', remote INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE run_log (at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
    INSERT INTO searches VALUES ('default-1', 'Growth MX', 'growth marketing', 'Mexico', 0, 1);`)
  db.close()
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  process.env.CVFORGE_SATELLITE_DB_PATH = file
})
afterEach(() => {
  delete process.env.CVFORGE_CONFIG_PATH
  delete process.env.CVFORGE_SATELLITE_DB_PATH
  delete process.env.CVFORGE_MODE
  rmSync(dir, { recursive: true, force: true })
})

const actions = () => import('@/app/(app)/settings/actions')
const input = { label: 'Backend', keywords: 'node backend', location: 'Mexico', remote: true }

describe('search actions (Ajustes → Agente → Búsquedas)', () => {
  it('add, toggle and delete reach the agent’s table', async () => {
    const { addSearchAction, toggleSearchAction, deleteSearchAction } = await actions()
    expect(await addSearchAction(input)).toEqual({ ok: true })
    const added = readSearches(file).find((s) => s.label === 'Backend')
    expect(added?.enabled).toBe(true)
    expect(await toggleSearchAction('default-1', false)).toEqual({ ok: true })
    expect(await deleteSearchAction(added?.id ?? '')).toEqual({ ok: true })
    expect(await deleteSearchAction('default-1')).toMatchObject({ ok: false, code: 'search-last' })
    expect(readSearches(file)).toMatchObject([{ id: 'default-1', enabled: false }])
  })

  it('says why an add was refused', async () => {
    const { addSearchAction } = await actions()
    expect(await addSearchAction({ ...input, location: '' })).toMatchObject({
      ok: false,
      code: 'search-invalid',
    })
    expect(await addSearchAction({ ...input, label: 'GROWTH mx' })).toMatchObject({
      ok: false,
      code: 'search-duplicate',
    })
    expect(await addSearchAction({ label: 1 } as never)).toMatchObject({
      ok: false,
      code: 'search-invalid',
    })
  })

  it('without the agent’s database, says the agent is unavailable', async () => {
    process.env.CVFORGE_SATELLITE_DB_PATH = path.join(dir, 'missing.db')
    const { addSearchAction, toggleSearchAction, deleteSearchAction } = await actions()
    for (const out of [
      await addSearchAction(input),
      await toggleSearchAction('default-1', true),
      await deleteSearchAction('default-1'),
    ]) {
      expect(out).toMatchObject({ ok: false, code: 'agent-unavailable' })
    }
  })

  it('the demo changes nothing', async () => {
    process.env.CVFORGE_MODE = 'demo'
    const { addSearchAction } = await actions()
    expect(await addSearchAction(input)).toMatchObject({ ok: false, code: 'demo-read-only' })
    expect(readSearches(file)).toHaveLength(1)
  })
})
