import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db/client'
import {
  claimNext,
  enqueueKit,
  finishKit,
  latestKitFor,
  openKitFor,
  resetStale,
} from '@/lib/kit/queue'
import { seedApp, dbTest as withDb } from '../support/db-app'
import { must } from '../support/must'

// Local times: the server is the user's own Mac, so "today" and "03:00" are its clock.
const local = (d: string, h: number, m = 0) =>
  new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
const TODAY = '2026-10-15'
const TOMORROW = '2026-10-16'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-kit-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
})
afterEach(() => {
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

function app(db: Db, n = 1): string {
  return seedApp(db, `Acme ${n}`)
}

describe('kit queue', () => {
  it(
    'keeps one open kit per application',
    withDb((db) => {
      const a = app(db)
      expect(enqueueKit(db, a, local(TODAY, 10)).ok).toBe(true)
      expect(enqueueKit(db, a, local(TODAY, 10, 1))).toEqual({ ok: false, reason: 'open' })
      expect(openKitFor(db, a)?.state).toBe('queued')
    }),
  )

  it(
    'stops at the daily cap from Ajustes',
    withDb((db) => {
      writeFileSync(
        must(process.env.CVFORGE_CONFIG_PATH, 'CVFORGE_CONFIG_PATH'),
        JSON.stringify({ kitDailyCap: 2 }),
      )
      expect(enqueueKit(db, app(db, 1), local(TODAY, 9)).ok).toBe(true)
      expect(enqueueKit(db, app(db, 2), local(TODAY, 10)).ok).toBe(true)
      expect(enqueueKit(db, app(db, 3), local(TODAY, 11))).toEqual({ ok: false, reason: 'cap' })
      // A new day, a new count.
      expect(enqueueKit(db, app(db, 3), local(TOMORROW, 9)).ok).toBe(true)
    }),
  )

  it(
    'defaults to 5 a day',
    withDb((db) => {
      for (let n = 1; n <= 5; n++)
        expect(enqueueKit(db, app(db, n), local(TODAY, 9, n)).ok).toBe(true)
      expect(enqueueKit(db, app(db, 6), local(TODAY, 10))).toEqual({ ok: false, reason: 'cap' })
    }),
  )

  it(
    'hands out one job at a time',
    withDb((db) => {
      const a = app(db)
      enqueueKit(db, a, local(TODAY, 10))
      const job = claimNext(db, local(TODAY, 10, 1))
      expect(job).toMatchObject({ applicationId: a, state: 'running', attempts: 1 })
      expect(claimNext(db, local(TODAY, 10, 2))).toBeNull()
    }),
  )

  it(
    'a kit interrupted by a restart runs again, and the interrupted try does not count',
    withDb((db) => {
      enqueueKit(db, app(db), local(TODAY, 10))
      claimNext(db, local(TODAY, 10, 1))
      expect(resetStale(db)).toBe(1)
      expect(claimNext(db, local(TODAY, 10, 2))?.attempts).toBe(1)
    }),
  )

  it(
    'a failed kit waits for 03:00 the next night, once',
    withDb((db) => {
      const a = app(db)
      enqueueKit(db, a, local(TODAY, 10))
      const job = must(claimNext(db, local(TODAY, 10, 1)), 'a claimed job')
      finishKit(db, job.id, { ok: false, code: 'network' }, local(TODAY, 10, 4))
      expect(latestKitFor(db, a)?.state).toBe('queued')
      expect(claimNext(db, local(TODAY, 14))).toBeNull()
      expect(claimNext(db, local(TODAY, 23, 59))).toBeNull()
      expect(claimNext(db, local(TOMORROW, 2, 59))).toBeNull()
      const retry = must(claimNext(db, local(TOMORROW, 3, 10)), 'a claimed job')
      expect(retry.attempts).toBe(2)
      finishKit(db, retry.id, { ok: false, code: 'network' }, local(TOMORROW, 3, 13))
      expect(latestKitFor(db, a)).toMatchObject({ state: 'failed', errorCode: 'network' })
      expect(claimNext(db, local('2026-10-17', 3, 10))).toBeNull()
    }),
  )

  it(
    'a billing or auth failure is never retried',
    withDb((db) => {
      const a = app(db)
      enqueueKit(db, a, local(TODAY, 10))
      finishKit(
        db,
        must(claimNext(db, local(TODAY, 10, 1)), 'a claimed job').id,
        { ok: false, code: 'billing' },
        local(TODAY, 10, 2),
      )
      expect(latestKitFor(db, a)).toMatchObject({ state: 'failed', errorCode: 'billing' })
      expect(claimNext(db, local(TOMORROW, 3, 10))).toBeNull()
    }),
  )

  it(
    'a done kit closes; a new one can be asked for',
    withDb((db) => {
      const a = app(db)
      enqueueKit(db, a, local(TODAY, 10))
      finishKit(
        db,
        must(claimNext(db, local(TODAY, 10, 1)), 'a claimed job').id,
        { ok: true },
        local(TODAY, 10, 4),
      )
      expect(latestKitFor(db, a)?.state).toBe('done')
      expect(openKitFor(db, a)).toBeNull()
      expect(enqueueKit(db, a, local(TODAY, 11)).ok).toBe(true)
    }),
  )
})

describe('kitPhase', () => {
  it(
    'tells working from a failed kit waiting for its night retry',
    withDb(async (db) => {
      const { kitPhase } = await import('@/lib/kit/queue')
      const a = app(db)
      expect(kitPhase(latestKitFor(db, a), local(TODAY, 10))).toBe('none')
      enqueueKit(db, a, local(TODAY, 10))
      expect(kitPhase(latestKitFor(db, a), local(TODAY, 10))).toBe('working')
      const job = must(claimNext(db, local(TODAY, 10, 1)), 'a claimed job')
      expect(kitPhase(latestKitFor(db, a), local(TODAY, 10, 1))).toBe('working')
      finishKit(db, job.id, { ok: false, code: 'network' }, local(TODAY, 10, 4))
      expect(kitPhase(latestKitFor(db, a), local(TODAY, 11))).toBe('retry')
      expect(kitPhase(latestKitFor(db, a), local(TOMORROW, 3, 1))).toBe('working')
    }),
  )
})

describe('kit queue — review fixes', () => {
  it(
    'a kit stuck running for 15 minutes (a restored backup, a crash) no longer blocks the queue',
    withDb((db) => {
      const a = app(db, 1)
      const b = app(db, 2)
      enqueueKit(db, a, local(TODAY, 10))
      enqueueKit(db, b, local(TODAY, 10, 1))
      claimNext(db, local(TODAY, 10, 2)) // a: running, never finished
      expect(claimNext(db, local(TODAY, 10, 10))).toBeNull()
      const next = claimNext(db, local(TODAY, 10, 18))
      expect(next?.applicationId).toBe(a) // a reset to queued, oldest first
    }),
  )

  it(
    'a chase never queues a kit over documents that already exist',
    withDb(async (db) => {
      const { enqueueChaseKit } = await import('@/lib/kit/queue')
      const { mergeDocuments } = await import('@/lib/db/queries/applications')
      const a = app(db)
      mergeDocuments(db, a, { cv: { edited: 'by hand' } })
      expect(enqueueChaseKit(db, a, local(TODAY, 10))).toBe('has-docs')
      expect(latestKitFor(db, a)).toBeNull()
      const b = app(db, 2)
      expect(enqueueChaseKit(db, b, local(TODAY, 10))).toBe('queued')
      writeFileSync(
        must(process.env.CVFORGE_CONFIG_PATH, 'CVFORGE_CONFIG_PATH'),
        JSON.stringify({ kitOnChase: false }),
      )
      expect(enqueueChaseKit(db, app(db, 3), local(TODAY, 10))).toBe('off')
    }),
  )

  it(
    'lists kit failures since a time, with the job, for the agent to report',
    withDb(async (db) => {
      const { kitFailuresSince } = await import('@/lib/kit/queue')
      const a = app(db)
      enqueueKit(db, a, local(TODAY, 10))
      finishKit(
        db,
        must(claimNext(db, local(TODAY, 10, 1)), 'a claimed job').id,
        { ok: false, code: 'billing' },
        local(TODAY, 10, 3),
      )
      const failures = kitFailuresSince(db, local(TODAY, 10).toISOString())
      expect(failures).toEqual([
        expect.objectContaining({
          applicationId: a,
          errorCode: 'billing',
          jobTitle: 'Growth Lead',
        }),
      ])
      expect(kitFailuresSince(db, local(TODAY, 10, 5).toISOString())).toEqual([])
    }),
  )
})
