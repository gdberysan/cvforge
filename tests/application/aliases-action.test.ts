import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db/client'

const holder: { db?: Db } = {}

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    db: new Proxy({} as Db, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { openDb, runMigrations } = await import('@/lib/db/client')
const { createApplication, getApplication } = await import('@/lib/db/queries/applications')
const { saveCompanyAliasesAction } = await import('@/app/(app)/application/actions')

let dir: string
let close: () => void
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-alias-act-'))
  const opened = openDb(path.join(dir, 'test.db'))
  runMigrations(opened.db)
  holder.db = opened.db
  close = opened.close
  createApplication(opened.db, {
    id: 'app_1',
    source: 'linkedin',
    company: 'Pavo',
    jobTitle: 'Growth Lead',
    market: 'mx',
    documentLanguage: 'es-MX',
    postingRaw: 'p',
    postingHash: 'h',
    evidenceHash: 'e',
    requirements: [],
    mappings: [],
    coverage: {
      verdict: 'stretch',
      mandatoryTotal: 0,
      mandatoryStrong: 0,
      mandatoryPartial: 0,
      mandatoryMissing: 0,
      desirableTotal: 0,
      desirableStrong: 0,
      desirablePartial: 0,
      desirableMissing: 0,
      hardBlockers: [],
    },
  })
})
afterEach(() => {
  close()
  delete process.env.CVFORGE_MODE
  rmSync(dir, { recursive: true, force: true })
})

describe('saveCompanyAliasesAction', () => {
  it('saves the normalised list and returns it', async () => {
    const out = await saveCompanyAliasesAction('app_1', [
      ' Pavo Pagos ',
      'talent@Pavo.MX',
      'pavo pagos',
    ])
    expect(out).toEqual({ ok: true, aliases: ['Pavo Pagos', 'pavo.mx'] })
    expect(getApplication(holder.db as Db, 'app_1')?.companyAliases).toEqual([
      'Pavo Pagos',
      'pavo.mx',
    ])
  })

  it('refuses too many or too long, and changes nothing', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `Alpha${i}`)
    expect(await saveCompanyAliasesAction('app_1', eleven)).toMatchObject({
      ok: false,
      code: 'aliases-too-many',
    })
    expect(await saveCompanyAliasesAction('app_1', ['x'.repeat(81)])).toMatchObject({
      ok: false,
      code: 'alias-too-long',
    })
    expect(getApplication(holder.db as Db, 'app_1')?.companyAliases).toEqual([])
  })

  it('an unknown application is not found', async () => {
    expect(await saveCompanyAliasesAction('app_nope', ['Pavo'])).toMatchObject({
      ok: false,
      code: 'not-found',
    })
  })

  it('the demo writes nothing', async () => {
    process.env.CVFORGE_MODE = 'demo'
    expect(await saveCompanyAliasesAction('app_1', ['Pavo'])).toMatchObject({
      ok: false,
      code: 'demo-read-only',
    })
    delete process.env.CVFORGE_MODE
    expect(getApplication(holder.db as Db, 'app_1')?.companyAliases).toEqual([])
  })
})
