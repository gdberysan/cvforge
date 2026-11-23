import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { latestPrep } from '@/lib/db/queries/prep'
import { saveProfile } from '@/lib/db/queries/profile'
import { profile } from '../prep/fixtures'
import { rawPrep } from '../prep/raw'
import { seedApp } from '../support/db-app'

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
const runs = vi.hoisted(() => ({ n: 0, gate: null as Promise<void> | null }))
vi.mock('@/lib/prep/pipeline', () => ({
  runPrep: async (_ctx: unknown, onStage?: (s: string) => void) => {
    runs.n++
    onStage?.('writing')
    if (runs.gate) await runs.gate
    onStage?.('checking')
    return {
      content: { ...rawPrep(), coverage: [] },
      report: { flags: [], tells: [], passed: true },
    }
  },
}))

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-prep-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
  saveProfile(handle.db, profile)
})
afterAll(() => {
  handle.close()
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

const post = async (body: object) => {
  const { POST } = await import('@/app/api/ai/prep/route')
  return POST(
    new Request('http://localhost/api/ai/prep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
const events = async (res: Response) =>
  (await res.text())
    .split('\n\n')
    .filter((c) => c.startsWith('data: '))
    .map((c) => JSON.parse(c.slice(6)))

describe('POST /api/ai/prep', () => {
  it('is 404 for an unknown application', async () => {
    const res = await post({ applicationId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('streams its stages, saves one prep with the evidence hash, and ends done', async () => {
    const a = seedApp(handle.db, 'Acme')
    const before = runs.n
    const res = await post({ applicationId: a, language: 'es-MX' })
    const ev = await events(res)
    expect(ev.map((e) => e.stage).filter(Boolean)).toEqual(['writing', 'checking'])
    const done = ev.at(-1)
    expect(done.done).toBe(true)
    expect(runs.n).toBe(before + 1)
    const row = latestPrep(handle.db, a, 'es-MX')
    expect(row?.id).toBe(done.prepId)
    expect(row?.evidenceHash).toMatch(/\w{8,}/)
  })

  it('refuses a second run while one is writing, and frees the lock when it ends', async () => {
    const a = seedApp(handle.db, 'Twice')
    let open = () => {}
    runs.gate = new Promise<void>((r) => {
      open = r
    })
    const first = await post({ applicationId: a, language: 'es-MX' })
    const second = await post({ applicationId: a, language: 'es-MX' })
    expect(second.status).toBe(409)
    expect((await second.json()).code).toBe('prep-busy')
    runs.gate = null
    open()
    expect((await events(first)).at(-1).done).toBe(true)
    const third = await post({ applicationId: a, language: 'es-MX' })
    expect((await events(third)).at(-1).done).toBe(true)
  })
})
