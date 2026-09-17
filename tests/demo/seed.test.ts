import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { listAnswers } from '@/lib/db/queries/answers'
import { getApplication, listApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { loadSeed, type Seed, SeedSchema } from '@/lib/demo/seed'
import { hashEvidenceProjection } from '@/lib/hash'

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-seed-'))
  const { db, close } = openDb(path.join(dir, 'seed.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const emptyCoverage = {
  mandatoryTotal: 0,
  mandatoryStrong: 0,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
}

const seed: Seed = {
  builtAt: '2026-08-21T00:00:00.000Z',
  profile: {
    basics: {
      fullName: 'Lucas Lara',
      headline: 'Marketing',
      email: 'l@example.com',
      location: 'CDMX',
      timezone: 'America/Mexico_City',
      links: [],
    },
    summary: '',
    experience: [
      {
        id: 'role_demo_1',
        title: 'Coordinador',
        company: 'Farmacias del Valle',
        period: { start: '2021-03', end: '2025-06' },
        summary: '',
      },
    ],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    workAuthorization: [],
    preferences: { targetTitles: [], markets: ['mx'] },
    updatedAt: '2026-08-21T00:00:00.000Z',
  },
  evidence: [
    {
      id: 'ev_demo_01',
      kind: 'achievement',
      sourceRef: { type: 'experience', id: 'role_demo_1' },
      text: 'Subí el ROAS de Meta Ads de 2.1 a 3.4 en seis meses',
      metrics: [{ raw: 'ROAS 2.1 a 3.4', value: 3.4, unit: 'x' }],
      tags: ['meta ads'],
      period: { start: '2021-03', end: '2025-06' },
      strength: 'core',
      origin: 'manual',
    },
  ],
  applications: [
    {
      id: 'app_demo_1',
      source: 'linkedin',
      company: 'Grupo Andino Retail',
      jobTitle: 'Coordinador(a) de Marketing Digital',
      market: 'mx',
      documentLanguage: 'es-MX',
      postingRaw: 'x'.repeat(100),
      postingHash: 'h1',
      evidenceHash: 'e1',
      requirements: [
        {
          id: 'req_1',
          text: 'Meta Ads',
          keyword: 'Meta Ads',
          variants: [],
          kind: 'hard',
          mandatory: true,
          weight: 3,
        },
      ],
      mappings: [
        { requirementId: 'req_1', evidenceIds: ['ev_demo_01'], strength: 'strong', rationale: '' },
      ],
      coverage: {
        ...emptyCoverage,
        mandatoryTotal: 1,
        mandatoryStrong: 1,
        verdict: 'strong',
      },
      documents: {
        cv: {
          header: { fullName: 'Lucas Lara', title: 'x', contactLines: [] },
          summary: '',
          experience: [],
          education: [],
          skills: [],
          extras: [],
        },
      },
      groundingReport: {
        uncitedBullets: [],
        invalidCitations: [],
        unverifiedNumbers: [],
        unknownEntities: [],
        distortions: [],
        claimedGaps: [],
        passed: true,
      },
      outcomes: [
        { at: '2026-08-10T00:00:00.000Z', type: 'applied' },
        { at: '2026-08-15T00:00:00.000Z', type: 'screen' },
      ],
      archived: false,
    },
    {
      id: 'app_demo_3',
      source: 'other',
      company: 'Agencia Norte',
      jobTitle: 'Performance',
      market: 'mx',
      documentLanguage: 'es-MX',
      postingRaw: 'y'.repeat(100),
      postingHash: 'h3',
      evidenceHash: 'e1',
      requirements: [],
      mappings: [],
      coverage: { ...emptyCoverage, verdict: 'skip' },
      documents: null,
      groundingReport: null,
      outcomes: [],
      archived: true,
    },
  ],
  answers: [{ question: '¿Por qué este puesto?', answer: 'Porque…', language: 'es-MX' }],
  interviewPlans: { role_demo_1: [] },
}

describe('loadSeed', () => {
  it('refuses a seed whose CV has no grounding report, naming the application', () => {
    // Silently dropping the CV surfaces far away — a seeded document that
    // should exist 404s or reads as a demo-miss. A malformed seed must fail
    // at load, where the demo:build author sees it.
    const broken = structuredClone(seed)
    broken.applications[0].groundingReport = null
    withDb((db) => {
      expect(() => loadSeed(db, broken)).toThrow(/app_demo_1/)
    })
  })

  it('round-trips the seed through the normal query layer with fixed ids', () => {
    expect(SeedSchema.safeParse(seed).success).toBe(true)
    withDb((db) => {
      loadSeed(db, seed)
      expect(getProfile(db)?.basics.fullName).toBe('Lucas Lara')
      expect(listEvidence(db).map((e) => e.id)).toEqual(['ev_demo_01'])

      const a1 = getApplication(db, 'app_demo_1')
      expect(a1?.status).toBe('interviewing') // derived from the outcomes
      expect(a1?.requirements[0].keyword).toBe('Meta Ads')
      expect(a1?.mappings[0].evidenceIds).toEqual(['ev_demo_01'])
      expect((a1?.documents as { cv?: unknown })?.cv).toBeTruthy()
      expect(a1?.groundingReport).toMatchObject({ passed: true })
      // Never stale in the demo: the hash is recomputed by the running projection.
      expect(a1?.evidenceHash).toBe(
        hashEvidenceProjection(buildEvidenceProjection(seed.profile, seed.evidence)),
      )

      const a3 = getApplication(db, 'app_demo_3')
      expect(a3?.archived).toBe(true)
      expect(a3?.status).toBe('archived')
      expect(listApplications(db, { archived: false }).map((a) => a.id)).toEqual(['app_demo_1'])

      expect(listAnswers(db)).toHaveLength(1)
    })
  })
})
