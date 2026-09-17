import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import {
  appendOutcome,
  createApplication,
  findByPostingHash,
  getApplication,
  listApplications,
  mergeDocuments,
  saveDocuments,
  setArchived,
  updateAnalysis,
  updateIntake,
} from '@/lib/db/queries/applications'
import { applications } from '@/lib/db/schema'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'

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

const requirements: Requirement[] = [
  {
    id: 'req_1',
    text: 'TypeScript',
    keyword: 'TypeScript',
    variants: [],
    kind: 'hard',
    mandatory: true,
    weight: 3,
  },
]

const mappings: EvidenceMapping[] = [
  { requirementId: 'req_1', evidenceIds: ['ev_1'], strength: 'strong', rationale: 'ok' },
]

const coverage: Coverage = {
  mandatoryTotal: 1,
  mandatoryStrong: 1,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  verdict: 'strong',
}

const input = {
  source: 'linkedin' as const,
  company: 'Acme',
  jobTitle: 'Senior Engineer',
  market: 'us-remote' as const,
  documentLanguage: 'en' as const,
  postingRaw: 'We need a senior engineer.',
  postingHash: 'abc123',
  evidenceHash: 'evh1',
  requirements,
  mappings,
  coverage,
}

describe('application queries', () => {
  it('creates an application with requirements and mappings, starting as triaged', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      const app = getApplication(db, id)

      expect(app).not.toBeNull()
      expect(app?.status).toBe('triaged')
      expect(app?.requirements).toHaveLength(1)
      expect(app?.requirements[0].id).toBe('req_1')
      expect(app?.mappings[0].evidenceIds).toEqual(['ev_1'])
      expect(app?.coverage.verdict).toBe('strong')
    })
  })

  it('finds a previously triaged posting by hash so re-analysis is free', () => {
    withDb((db) => {
      createApplication(db, input)
      expect(findByPostingHash(db, 'abc123')).not.toBeNull()
      expect(findByPostingHash(db, 'nope')).toBeNull()
    })
  })

  it('recomputes the denormalised status when an outcome is appended', () => {
    withDb((db) => {
      const id = createApplication(db, input)

      appendOutcome(db, id, { at: '2026-08-10T00:00:00.000Z', type: 'applied' })
      expect(getApplication(db, id)?.status).toBe('applied')

      appendOutcome(db, id, { at: '2026-08-14T00:00:00.000Z', type: 'interview' })
      expect(getApplication(db, id)?.status).toBe('interviewing')
    })
  })

  it('cascades deletes so requirements do not outlive their application', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      db.delete(applications).where(eq(applications.id, id)).run()
      expect(getApplication(db, id)).toBeNull()
    })
  })

  it('remembers which evidence base the analysis was computed against', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      expect(getApplication(db, id)?.evidenceHash).toBe('evh1')
    })
  })

  it('archives a skipped posting, and unarchiving re-derives the real status', () => {
    withDb((db) => {
      const id = createApplication(db, input)

      setArchived(db, id, true)
      expect(getApplication(db, id)?.status).toBe('archived')

      setArchived(db, id, false)
      expect(getApplication(db, id)?.status).toBe('triaged')
    })
  })

  it('keeps skipped postings out of the pipeline list unless asked for', () => {
    withDb((db) => {
      const kept = createApplication(db, input)
      const skipped = createApplication(db, { ...input, postingHash: 'def456' })
      setArchived(db, skipped, true)

      expect(listApplications(db).map((a) => a.id)).toEqual([kept])
      expect(listApplications(db, { archived: true }).map((a) => a.id)).toEqual([skipped])
    })
  })

  it('refreshes mappings and coverage in place when the evidence base changed', () => {
    withDb((db) => {
      const id = createApplication(db, input)

      updateAnalysis(db, id, {
        mappings: [
          { requirementId: 'req_1', evidenceIds: ['ev_9'], strength: 'partial', rationale: 'new' },
        ],
        coverage: {
          ...coverage,
          mandatoryStrong: 0,
          mandatoryPartial: 1,
          verdict: 'worth-it',
        },
        evidenceHash: 'evh2',
      })

      const app = getApplication(db, id)
      expect(app?.mappings).toEqual([
        { requirementId: 'req_1', evidenceIds: ['ev_9'], strength: 'partial', rationale: 'new' },
      ])
      expect(app?.coverage.verdict).toBe('worth-it')
      expect(app?.evidenceHash).toBe('evh2')
      // Requirements came from the posting, which has not changed.
      expect(app?.requirements).toHaveLength(1)
    })
  })

  it('a re-triage records the latest market and source, keeping an existing url', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      updateIntake(db, id, { market: 'us-remote', source: 'referral' })

      const app = getApplication(db, id)
      expect(app?.market).toBe('us-remote')
      expect(app?.source).toBe('referral')
    })
  })

  it('keeps the stored source and url when a re-analysis sends neither', () => {
    // Reanalyse and gap-fill post only text and market; a defaulted source
    // used to turn every LinkedIn application into "other" on re-score.
    withDb((db) => {
      const id = createApplication(db, { ...input, source: 'linkedin', sourceUrl: 'https://x.y/1' })
      updateIntake(db, id, { market: 'us-remote' })

      const app = getApplication(db, id)
      expect(app?.source).toBe('linkedin')
      expect(app?.sourceUrl).toBe('https://x.y/1')
    })
  })

  it('recomposing the CV keeps the companion documents already generated', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      mergeDocuments(db, id, { coverLetter: { paragraphs: [] } })
      saveDocuments(
        db,
        id,
        { cv: { fake: 'cv' } },
        {
          uncitedBullets: [],
          invalidCitations: [],
          unverifiedNumbers: [],
          unknownEntities: [],
          distortions: [],
          claimedGaps: [],
          passed: true,
        },
      )

      const app = getApplication(db, id)
      expect(app?.documents).toMatchObject({
        cv: { fake: 'cv' },
        coverLetter: { paragraphs: [] },
      })
    })
  })

  it('merges companion documents without clobbering the saved CV', () => {
    withDb((db) => {
      const id = createApplication(db, input)
      mergeDocuments(db, id, { cv: { fake: 'cv' } })
      mergeDocuments(db, id, { coverLetter: { paragraphs: [] } })

      const app = getApplication(db, id)
      expect(app?.documents).toMatchObject({
        cv: { fake: 'cv' },
        coverLetter: { paragraphs: [] },
      })
      // Documents exist now, so the derived status moves to drafting.
      expect(app?.status).toBe('drafting')
    })
  })

  it('namespaces requirement ids per application so two applications can share req_1', () => {
    withDb((db) => {
      const first = createApplication(db, input)
      const second = createApplication(db, { ...input, postingHash: 'def456' })

      expect(getApplication(db, first)?.requirements[0].id).toBe('req_1')
      expect(getApplication(db, second)?.requirements[0].id).toBe('req_1')
      expect(first).not.toBe(second)
    })
  })
})
