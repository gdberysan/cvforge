import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { saveVariantCv, upsertVariantBrief } from '@/lib/db/queries/cv-variants'
import { saveProfile } from '@/lib/db/queries/profile'

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
// No model call: the translation reports that it cut the source by three.
vi.mock('@/lib/variant-translation', async (orig) => {
  const real = await orig<typeof import('@/lib/variant-translation')>()
  return {
    ...real,
    translateAndSave: async (_db: Db, args: { onTrimmedSource?: (n: number) => void }) => {
      args.onTrimmedSource?.(3)
      return 'cvv_en'
    },
  }
})
vi.mock('@/lib/push/notify', () => ({ notify: async () => {} }))
vi.mock('@/lib/i18n/server', () => ({ getLocale: async () => 'es' }))

let sourceId: string
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-translate-trim-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  handle = openDb(path.join(dir, 'test.db'))
  runMigrations(handle.db)
  saveProfile(handle.db, {
    basics: {
      fullName: 'Dana',
      headline: '',
      email: 'x@example.com',
      location: 'CDMX',
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
    updatedAt: '2026-10-16T00:00:00.000Z',
  })
  sourceId = upsertVariantBrief(handle.db, {
    name: 'E-commerce',
    focus: 'x',
    language: 'es-MX',
    market: 'mx',
  })
  saveVariantCv(handle.db, sourceId, {
    cv: {
      header: { fullName: 'Dana', title: 'Growth', contactLines: [] },
      summary: '',
      summaryCitedEvidenceIds: [],
      experience: [],
      projects: [],
      education: [],
      skills: [],
      extras: [],
    },
    report: {
      uncitedBullets: [],
      invalidCitations: [],
      unverifiedNumbers: [],
      unknownEntities: [],
      distortions: [],
      claimedGaps: [],
      unsupportedClaims: [],
      passed: true,
    },
    evidenceHash: 'h',
  })
})

afterAll(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('POST /api/ai/variant/translate', () => {
  it('tells the client when the source was cut to keep the pair identical', async () => {
    const { POST } = await import('@/app/api/ai/variant/translate/route')
    const res = await POST(
      new Request('http://localhost/api/ai/variant/translate', {
        method: 'POST',
        body: JSON.stringify({ sourceId }),
      }),
    )
    const text = await res.text()
    expect(text).toContain('data: {"trimmedSource":3}')
    expect(text.indexOf('trimmedSource')).toBeLessThan(text.indexOf('"done":true'))
  })
})
