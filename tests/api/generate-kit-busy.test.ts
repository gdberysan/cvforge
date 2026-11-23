import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chaseFind } from '@/lib/agent/chase'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { saveProfile } from '@/lib/db/queries/profile'
import { enqueueKit, finishKit } from '@/lib/kit/queue'
import { find } from '../agent/fixtures'

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
// Never a model call from this file: reaching either means the guard let it through.
const generated = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/lib/kit/generate', () => ({
  generateCv: async () => {
    generated.calls.push('cv')
    throw new Error('unreachable')
  },
  generateCompanion: async (_db: unknown, _id: string, kind: string) => {
    generated.calls.push(kind)
    throw new Error('unreachable')
  },
}))

// No request scope here to read a locale cookie from.
vi.mock('@/lib/i18n/server', () => ({ getLocale: async () => 'es' }))

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-kitbusy-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
  saveProfile(handle.db, {
    basics: {
      fullName: 'Dana Sofía Pérez Ruiz',
      headline: '',
      email: 'x@example.com',
      location: 'Ciudad de México',
      timezone: 'America/Mexico_City',
      links: [],
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    workAuthorization: [],
    preferences: { targetTitles: [], markets: [] },
    updatedAt: '2026-08-09T00:00:00.000Z',
  })
})
afterAll(() => {
  handle.close()
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

const post = async (route: 'compose' | 'companion', body: object) => {
  const mod =
    route === 'compose'
      ? await import('@/app/api/ai/compose/route')
      : await import('@/app/api/ai/companion/route')
  return mod.POST(
    new Request(`http://localhost/api/ai/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

/**
 * A documents page opened before a Telegram chase still shows Generar. While
 * the background kit is writing that application's CV and letter, a tap on
 * it must not pay for the same documents a second time.
 */
describe('Generar while the kit is being written', () => {
  it('refuses the CV and the cover letter, and lets a screening answer through', async () => {
    const out = chaseFind(handle.db, '4460829599', find())
    if (out.kind === 'repost') throw new Error('fixture')
    const id = out.applicationId
    enqueueKit(handle.db, id)

    const cv = await post('compose', { applicationId: id })
    expect(cv.status).toBe(409)
    expect((await cv.json()).code).toBe('kit-busy')

    const letter = await post('companion', { applicationId: id, kind: 'coverLetter' })
    expect(letter.status).toBe(409)
    expect((await letter.json()).code).toBe('kit-busy')

    // Not part of the kit.
    const screening = await post('companion', { applicationId: id, kind: 'screening' })
    expect(screening.status).not.toBe(409)
    expect(generated.calls).not.toContain('cv')
    expect(generated.calls).not.toContain('coverLetter')
  })

  it('a kit waiting for its night retry does not hold Generar', async () => {
    const out = chaseFind(
      handle.db,
      '4460829600',
      find({ postingHash: 'h_retry', sourceUrl: 'https://www.linkedin.com/jobs/view/4460829600/' }),
    )
    if (out.kind === 'repost') throw new Error('fixture')
    const kit = enqueueKit(handle.db, out.applicationId)
    if (!kit.ok) throw new Error('fixture')
    finishKit(handle.db, kit.jobId, { ok: false, code: 'overloaded' })
    const letter = await post('companion', {
      applicationId: out.applicationId,
      kind: 'coverLetter',
    })
    expect(letter.status).not.toBe(409)
    expect(generated.calls).toContain('coverLetter')
  })
})
