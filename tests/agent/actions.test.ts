import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPendingFind } from '@/lib/agent/finds'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listApplications } from '@/lib/db/queries/applications'
import { listDismissedJobIds } from '@/lib/db/queries/discover'
import { latestKitFor } from '@/lib/kit/queue'
import { must } from '../support/must'
import { addShown, find, satelliteFile } from './fixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
let handle: { db: Db; close: () => void }
vi.mock('@/lib/db/client', async (orig) => {
  const real = await orig<typeof import('@/lib/db/client')>()
  return {
    ...real,
    get db() {
      return handle.db
    },
  }
})

let dir: string
let sat: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-findact-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  sat = satelliteFile(dir)
  process.env.CVFORGE_SATELLITE_DB_PATH = sat
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
  addShown(sat, '4460829599', JSON.stringify(find()), '2026-10-15T17:00:00.000Z')
})
afterEach(() => {
  handle.close()
  delete process.env.CVFORGE_CONFIG_PATH
  delete process.env.CVFORGE_SATELLITE_DB_PATH
  rmSync(dir, { recursive: true, force: true })
})

const actions = () => import('@/app/(app)/agent/actions')

describe('chaseFindAction', () => {
  it('creates the application, clears the find, and queues the kit', async () => {
    const { chaseFindAction } = await actions()
    const out = await chaseFindAction('4460829599')
    expect(out).toMatchObject({ ok: true, kit: 'queued' })
    if (!out.ok) return
    expect(listApplications(handle.db)).toHaveLength(1)
    expect(getPendingFind(sat, '4460829599')).toBeNull()
    expect(latestKitFor(handle.db, out.applicationId)?.state).toBe('queued')
  })

  it('with the kit switch off, chases without a kit', async () => {
    writeFileSync(
      must(process.env.CVFORGE_CONFIG_PATH, 'CVFORGE_CONFIG_PATH'),
      JSON.stringify({ kitOnChase: false }),
    )
    const { chaseFindAction } = await actions()
    const out = await chaseFindAction('4460829599')
    expect(out).toMatchObject({ ok: true, kit: 'off' })
    if (out.ok) expect(latestKitFor(handle.db, out.applicationId)).toBeNull()
  })

  it("records the chase in the agent's log, which the weekly report counts", async () => {
    const { chaseFindAction } = await actions()
    await chaseFindAction('4460829599')
    const db = new Database(sat)
    const rows = db.prepare("SELECT event, detail FROM run_log WHERE event = 'chase'").all()
    db.close()
    expect(rows).toEqual([{ event: 'chase', detail: '4460829599' }])
  })

  it('a find already chased elsewhere (Telegram) is gone, not an error', async () => {
    const { chaseFindAction } = await actions()
    expect(await chaseFindAction('9999999')).toEqual({ ok: false, code: 'gone' })
  })

  it('chasing twice keeps one application and one kit', async () => {
    const { chaseFindAction } = await actions()
    const first = await chaseFindAction('4460829599')
    addShown(sat, '4460829599', JSON.stringify(find()), '2026-10-15T17:05:00.000Z')
    const second = await chaseFindAction('4460829599')
    expect(second).toMatchObject({ ok: true, kit: 'open' })
    if (first.ok && second.ok) expect(second.applicationId).toBe(first.applicationId)
    expect(listApplications(handle.db)).toHaveLength(1)
  })
})

describe('dismissFindAction', () => {
  it('dismisses the posting and clears the find', async () => {
    const { dismissFindAction } = await actions()
    expect(await dismissFindAction('4460829599')).toEqual({ ok: true })
    expect(listDismissedJobIds(handle.db)).toContain('4460829599')
    expect(getPendingFind(sat, '4460829599')).toBeNull()
  })
})
