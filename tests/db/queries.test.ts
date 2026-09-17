import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { deleteEvidence, listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const profile: MasterProfile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: 'Full-stack engineer',
    email: 'g@example.com',
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
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

function evidence(id: string, text: string): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text,
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  }
}

describe('profile queries', () => {
  it('returns null before anything is saved', () => {
    withDb((db) => expect(getProfile(db)).toBeNull())
  })

  it('round-trips a profile and overwrites on second save', () => {
    withDb((db) => {
      saveProfile(db, profile)
      expect(getProfile(db)?.basics.fullName).toBe('Dana Sofía Pérez Ruiz')

      saveProfile(db, { ...profile, summary: 'updated' })
      expect(getProfile(db)?.summary).toBe('updated')
    })
  })
})

describe('evidence queries', () => {
  it('lists evidence deterministically, falling back to id when positions tie', () => {
    // The projection re-sorts by id itself, so the cache does not depend on
    // this order — but the editor does, and it must never be arbitrary.
    withDb((db) => {
      upsertEvidence(db, evidence('ev_c', 'third'))
      upsertEvidence(db, evidence('ev_a', 'first'))
      upsertEvidence(db, evidence('ev_b', 'second'))

      expect(listEvidence(db).map((e) => e.id)).toEqual(['ev_a', 'ev_b', 'ev_c'])
    })
  })

  it('lists evidence in recorded order, not lexicographic id order', () => {
    // "ev_10" sorts before "ev_2" as a string; the tenth record must not
    // jump above the second once a role passes nine records.
    withDb((db) => {
      upsertEvidence(db, evidence('ev_10', 'tenth'), 9)
      upsertEvidence(db, evidence('ev_2', 'second'), 1)

      expect(listEvidence(db).map((e) => e.id)).toEqual(['ev_2', 'ev_10'])
    })
  })

  it('keeps an item in place when an edit does not name a position', () => {
    // The debounced editor save passes no position; it must not teleport the
    // record to the top by resetting its ordinal to zero.
    withDb((db) => {
      upsertEvidence(db, evidence('ev_b', 'first-recorded'), 0)
      upsertEvidence(db, evidence('ev_a', 'second-recorded'), 1)

      upsertEvidence(db, evidence('ev_a', 'second-recorded, edited'))

      expect(listEvidence(db).map((e) => e.id)).toEqual(['ev_b', 'ev_a'])
    })
  })

  it('upsert replaces an existing item rather than duplicating it', () => {
    withDb((db) => {
      upsertEvidence(db, evidence('ev_a', 'original'))
      upsertEvidence(db, evidence('ev_a', 'revised'))

      const all = listEvidence(db)
      expect(all).toHaveLength(1)
      expect(all[0].text).toBe('revised')
    })
  })

  it('deletes an item', () => {
    withDb((db) => {
      upsertEvidence(db, evidence('ev_a', 'x'))
      deleteEvidence(db, 'ev_a')
      expect(listEvidence(db)).toHaveLength(0)
    })
  })
})
