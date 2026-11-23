import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listPeople, upsertAgentPeople } from '@/lib/db/queries/people'
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-people-'))
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
})
afterAll(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('people actions', () => {
  it('saves a manual person and hides one so the agent never brings them back', async () => {
    const { savePersonAction, hidePersonAction } = await import(
      '@/app/(app)/application/[id]/people-actions'
    )
    const a = seedApp(handle.db)
    expect(
      await savePersonAction({ applicationId: a, name: '  ', email: '', role: '' }),
    ).toMatchObject({ ok: false })
    expect(
      await savePersonAction({ applicationId: a, name: 'Ana Ruiz', email: '', role: 'Recruiter' }),
    ).toEqual({ ok: true })
    upsertAgentPeople(handle.db, a, null, [
      { name: 'Room 4', email: 'room4@x.com', source: 'invite' },
    ])
    const room = listPeople(handle.db, a).find((p) => p.name === 'Room 4')
    expect(await hidePersonAction({ applicationId: a, id: room?.id ?? '' })).toEqual({ ok: true })
    upsertAgentPeople(handle.db, a, null, [
      { name: 'Room 4', email: 'room4@x.com', source: 'invite' },
    ])
    expect(listPeople(handle.db, a).map((p) => [p.name, p.role, p.source])).toEqual([
      ['Ana Ruiz', 'Recruiter', 'manual'],
    ])
  })

  it('never hides a person of another application', async () => {
    const { hidePersonAction } = await import('@/app/(app)/application/[id]/people-actions')
    const a = seedApp(handle.db, 'One')
    const b = seedApp(handle.db, 'Two')
    upsertAgentPeople(handle.db, b, null, [{ name: 'Bo', email: 'bo@x.com', source: 'invite' }])
    const bo = listPeople(handle.db, b)[0]
    expect(await hidePersonAction({ applicationId: a, id: bo?.id ?? '' })).toMatchObject({
      ok: false,
    })
    expect(listPeople(handle.db, b)).toHaveLength(1)
  })
})
