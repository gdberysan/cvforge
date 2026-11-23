import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { enqueueKit } from '@/lib/kit/queue'

let dir: string
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

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-kitstatus-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
})
afterAll(() => {
  handle.close()
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

const get = async (q: string) => {
  const { GET } = await import('@/app/api/kit/status/route')
  return GET(new Request(`http://localhost/api/kit/status${q}`))
}

describe('GET /api/kit/status', () => {
  it('none for an application without a kit', async () => {
    expect(await (await get('?applicationId=app_none')).json()).toEqual({
      state: 'none',
      phase: 'none',
    })
  })

  it('the latest kit state', async () => {
    enqueueKit(handle.db, 'app_1')
    expect(await (await get('?applicationId=app_1')).json()).toEqual({
      state: 'queued',
      phase: 'working',
    })
  })

  it('400 without an id', async () => {
    expect((await get('')).status).toBe(400)
  })
})
