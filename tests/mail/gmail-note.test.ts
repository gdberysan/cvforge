import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import {
  appendOutcome,
  createApplication,
  listMailOutcomes,
  listOutcomes,
} from '@/lib/db/queries/applications'
import { isGmailNote, parseGmailNote } from '@/lib/gmail-note'
import { buildThread } from '@/lib/mail-thread'

describe('parseGmailNote', () => {
  it('reads the full form', () => {
    expect(parseGmailNote('gmail:18c9f «No continuamos.»')).toEqual({
      messageId: '18c9f',
      quote: 'No continuamos.',
    })
  })

  it('needs only the prefix: the quote is optional', () => {
    expect(parseGmailNote('gmail:18c9f')).toEqual({ messageId: '18c9f', quote: '' })
    expect(parseGmailNote('gmail:18c9f lost its guillemets')).toEqual({
      messageId: '18c9f',
      quote: 'lost its guillemets',
    })
    expect(parseGmailNote('gmail:')).toEqual({ messageId: '', quote: '' })
  })

  it('is null for anything that is not the agent', () => {
    for (const note of [null, undefined, '', 'user note', ' gmail:x «q»', 'Gmail:x «q»']) {
      expect(parseGmailNote(note)).toBeNull()
      expect(isGmailNote(note)).toBe(false)
    }
  })
})

/**
 * The Task 4 review ruling: Undo (`listMailOutcomes`) and the thread
 * (`buildThread`) must agree on what is the agent's. A malformed `gmail:`
 * note must never be listed under "Tú" as something the user did.
 */
describe('one definition of an agent outcome', () => {
  it('a malformed gmail: note is the agent’s in both Undo and the thread, never under Tú', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'cvforge-note-'))
    const { db, close } = openDb(path.join(d, 't.db'))
    try {
      runMigrations(db as Db)
      const id = createApplication(db, {
        source: 'linkedin',
        company: 'Acme',
        jobTitle: 'Eng',
        market: 'us-remote',
        documentLanguage: 'en',
        postingRaw: 'x',
        postingHash: 'h',
        evidenceHash: 'e',
        requirements: [],
        mappings: [],
        coverage: {
          mandatoryTotal: 0,
          mandatoryStrong: 0,
          mandatoryPartial: 0,
          mandatoryMissing: 0,
          desirableTotal: 0,
          desirableStrong: 0,
          desirablePartial: 0,
          desirableMissing: 0,
          hardBlockers: [],
          unjudgedGates: [],
          verdict: 'stretch',
        },
      })
      appendOutcome(db, id, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
      const noQuote = appendOutcome(db, id, {
        at: '2026-10-05T00:00:00.000Z',
        type: 'acknowledged',
        note: 'gmail:abc',
      })
      const noId = appendOutcome(db, id, {
        at: '2026-10-06T00:00:00.000Z',
        type: 'rejected',
        note: 'gmail: «Sin id»',
      })

      const undoable = listMailOutcomes(db, id).map((o) => o.id)
      expect(undoable).toEqual([noQuote, noId])

      const view = buildThread({
        outcomes: listOutcomes(db, id),
        mail: [],
        drafts: [],
        account: null,
        now: Date.parse('2026-10-16T00:00:00.000Z'),
        timeZone: 'UTC',
      })
      const events = view.cards.flatMap((c) => (c.type === 'event' ? [c.outcomeId] : []))
      expect(events.sort()).toEqual([...undoable].sort())
      expect(view.you.map((y) => y.kind)).toEqual(['applied'])
      const orphan = view.cards.find((c) => c.type === 'event' && c.outcomeId === noId)
      expect(orphan?.link).toBeNull()
      expect(orphan?.type === 'event' && orphan.quote).toBe('Sin id')
    } finally {
      close()
      rmSync(d, { recursive: true, force: true })
    }
  })
})
