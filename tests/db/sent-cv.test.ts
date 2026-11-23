import { describe, expect, it } from 'vitest'
import {
  appendOutcome,
  getApplication,
  removeOutcome,
  saveDocuments,
} from '@/lib/db/queries/applications'
import { seedApp, withDb } from '../support/db-app'

const ok = {
  uncitedBullets: [],
  invalidCitations: [],
  unverifiedNumbers: [],
  unknownEntities: [],
  distortions: [],
  claimedGaps: [],
  unsupportedClaims: [],
  passed: true,
}

describe('the CV he sent', () => {
  it('copies documents.cv to sentCv once, when the application is marked applied', () => {
    withDb((db) => {
      const a = seedApp(db)
      saveDocuments(db, a, { cv: { v: 1 } }, ok)
      appendOutcome(db, a, { at: '2026-10-07T20:00:00.000Z', type: 'applied' })
      saveDocuments(db, a, { cv: { v: 2 } }, ok)
      appendOutcome(db, a, { at: '2026-10-08T20:00:00.000Z', type: 'applied' })
      const docs = getApplication(db, a)?.documents as { cv: unknown; sentCv: unknown }
      expect(docs.sentCv).toEqual({ v: 1 })
      expect(docs.cv).toEqual({ v: 2 })
    })
  })

  it('an undone "applied" takes its snapshot with it; the real send snapshots again', () => {
    withDb((db) => {
      const a = seedApp(db)
      saveDocuments(db, a, { cv: { v: 1 } }, ok)
      const slip = appendOutcome(db, a, { at: '2026-10-07T20:00:00.000Z', type: 'applied' })
      removeOutcome(db, a, slip)
      saveDocuments(db, a, { cv: { v: 2 } }, ok)
      appendOutcome(db, a, { at: '2026-10-08T20:00:00.000Z', type: 'applied' })
      const docs = getApplication(db, a)?.documents as { sentCv: unknown }
      expect(docs.sentCv).toEqual({ v: 2 })
    })
  })

  it('undoing a second "applied" keeps the first one\'s snapshot', () => {
    withDb((db) => {
      const a = seedApp(db)
      saveDocuments(db, a, { cv: { v: 1 } }, ok)
      appendOutcome(db, a, { at: '2026-10-07T20:00:00.000Z', type: 'applied' })
      const again = appendOutcome(db, a, { at: '2026-10-08T20:00:00.000Z', type: 'applied' })
      removeOutcome(db, a, again)
      const docs = getApplication(db, a)?.documents as { sentCv: unknown }
      expect(docs.sentCv).toEqual({ v: 1 })
    })
  })
})
