import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  aliasProblem,
  companyCore,
  isDomainAlias,
  normalizeAliases,
  usableAliases,
} from '@/lib/company-aliases'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import {
  createApplication,
  getApplication,
  listFullApplications,
  setCompanyAliases,
} from '@/lib/db/queries/applications'

function withDb(fn: (db: Db, file: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-alias-'))
  const file = path.join(dir, 'test.db')
  const { db, close } = openDb(file)
  try {
    runMigrations(db)
    fn(db, file)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const create = (db: Db, id = 'app_1') =>
  createApplication(db, {
    id,
    source: 'linkedin',
    company: 'The Northwind Talent Co.',
    jobTitle: 'Growth Lead',
    market: 'mx',
    documentLanguage: 'es-MX',
    postingRaw: 'posting',
    postingHash: `h_${id}`,
    evidenceHash: 'ev',
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

describe('migration 0012 — applications.company_aliases', () => {
  it('adds a NOT NULL text column defaulting to an empty JSON array', () => {
    withDb((db) => {
      // Through the open connection, not by reopening the file: the same
      // question works on native SQLite and on the web edition's wasm build.
      const raw = (db as Db & { $client: Database.Database }).$client
      const col = (
        raw.prepare('PRAGMA table_info(applications)').all() as {
          name: string
          type: string
          notnull: number
          dflt_value: string | null
        }[]
      ).find((c) => c.name === 'company_aliases')
      expect({ ...col, type: col?.type.toLowerCase() }).toMatchObject({
        type: 'text',
        notnull: 1,
        dflt_value: "'[]'",
      })
    })
  })

  it('an application starts with no aliases, and both readers expose them', () => {
    withDb((db) => {
      create(db)
      expect(getApplication(db, 'app_1')?.companyAliases).toEqual([])
      setCompanyAliases(db, 'app_1', ['GTC Recruiting', 'globaltalent.co'])
      expect(getApplication(db, 'app_1')?.companyAliases).toEqual([
        'GTC Recruiting',
        'globaltalent.co',
      ])
      expect(listFullApplications(db)[0]?.companyAliases).toEqual([
        'GTC Recruiting',
        'globaltalent.co',
      ])
    })
  })
})

describe('normalizeAliases', () => {
  it('trims, drops blanks and dedupes case-insensitively, first spelling kept', () => {
    expect(normalizeAliases(['  Pavo ', '', 'PAVO', 'pavo.mx', '   '])).toEqual({
      ok: true,
      aliases: ['Pavo', 'pavo.mx'],
    })
  })

  it('an email address or an @domain becomes its domain, lower-cased', () => {
    expect(normalizeAliases(['talent@Clinicapp.COM', '@Pavo.mx'])).toEqual({
      ok: true,
      aliases: ['clinicapp.com', 'pavo.mx'],
    })
  })

  it('refuses more than 10, a value over 80 characters, and anything not a list of strings', () => {
    expect(normalizeAliases(Array.from({ length: 11 }, (_, i) => `Alpha${i}`))).toEqual({
      ok: false,
      code: 'aliases-too-many',
    })
    expect(normalizeAliases(['x'.repeat(81)])).toEqual({ ok: false, code: 'alias-too-long' })
    expect(normalizeAliases(['x'.repeat(80)])).toMatchObject({ ok: true })
    expect(normalizeAliases('Pavo')).toEqual({ ok: false, code: 'invalid-request' })
    expect(normalizeAliases([1])).toEqual({ ok: false, code: 'invalid-request' })
  })

  it('11 entries that dedupe to 10 are fine', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Alpha${i}`)
    expect(normalizeAliases([...ten, 'ALPHA0'])).toEqual({ ok: true, aliases: ten })
  })
})

describe('isDomainAlias', () => {
  it('a dot and no spaces is a domain; anything else is a name', () => {
    expect(isDomainAlias('pavo.mx')).toBe(true)
    expect(isDomainAlias('The Northwind Talent Co.')).toBe(false)
    expect(isDomainAlias('Pavo')).toBe(false)
  })
})

describe("I1 — an alias may never tie mail that is not the employer's", () => {
  it.each([
    ['gmail.com', 'alias-free-mail'],
    ['talent@Gmail.com', 'alias-free-mail'],
    ['yahoo.com.mx', 'alias-free-mail'],
    ['proton.me', 'alias-free-mail'],
    ['greenhouse.io', 'alias-job-board'],
    ['hire.lever.co', 'alias-job-board'],
    ['us.greenhouse-mail.io', 'alias-job-board'],
    ['linkedin.com', 'alias-job-board'],
    ['occ.com.mx', 'alias-job-board'],
    ['computrabajo.com', 'alias-job-board'],
    ['com.mx', 'alias-not-a-domain'],
    ['co.uk', 'alias-not-a-domain'],
    ['com.br', 'alias-not-a-domain'],
    ['.com', 'alias-not-a-domain'],
    ['HP', 'alias-too-short'],
    ['GTC', 'alias-too-short'],
    ['Koi Inc.', 'alias-too-short'],
    ['Talent', 'alias-generic'],
    ['Marketing', 'alias-generic'],
    ['RH', 'alias-too-short'],
    ['Recruiting Ltd', 'alias-generic'],
  ])('%s is refused (%s)', (alias, code) => {
    expect(normalizeAliases([alias])).toEqual({ ok: false, code })
  })

  it('specific names and registrable domains pass', () => {
    for (const a of [
      'pavo.mx',
      'pavo.com.mx',
      'mail.clinicapp.com',
      'Pavo Pagos',
      'Northwind Talent',
      'Clinicapp',
    ]) {
      expect(aliasProblem(a)).toBeNull()
    }
  })

  it('the agent drops the same ones from a hand-edited list', () => {
    expect(
      usableAliases(['gmail.com', ' Pavo.MX ', 'HP', 'Talent', 'Pavo Pagos', 3, 'com.mx']),
    ).toEqual(['pavo.mx', 'Pavo Pagos'])
    expect(usableAliases(undefined)).toEqual([])
  })
})

describe('N1 — companyCore drops a trailing legal form', () => {
  it.each([
    ['The Northwind Talent Co.', 'the northwind talent'],
    ['The Northwind Talent Co', 'the northwind talent'],
    ['Pavo Limited', 'pavo'],
    ['Pavo', 'pavo'],
    ['Acme, Inc.', 'acme'],
    ['Grupo Bimbo, S.A.B. de C.V.', 'grupo bimbo s a b de c v'],
    ['Kavak S.A. de C.V.', 'kavak'],
    ['Kavak SA de CV', 'kavak'],
    ['Clip S. de R.L.', 'clip'],
    ['Konfío SAPI de CV', 'konfio'],
    ['Rappi S.A.P.I. de C.V.', 'rappi'],
    ['Zalando GmbH', 'zalando'],
    ['Acme Corp Ltd', 'acme'],
  ])('%s → %s', (name, core) => {
    expect(companyCore(name)).toBe(core)
  })

  it('never strips to nothing or to one generic word', () => {
    expect(companyCore('Inc.')).toBe('inc')
    expect(companyCore('Global Co.')).toBe('global co')
    expect(companyCore('Talent LLC')).toBe('talent llc')
  })
})
