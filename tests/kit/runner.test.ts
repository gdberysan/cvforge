import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chaseFind } from '@/lib/agent/chase'
import { AiError } from '@/lib/ai/errors'
import { enqueueKit, latestKitFor } from '@/lib/kit/queue'
import { runKitOnce } from '@/lib/kit/runner'
import { find, withDb } from '../agent/fixtures'
import { must } from '../support/must'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-runner-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
})
afterEach(() => {
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

const NOW = () => new Date('2026-10-15T17:00:00Z')

describe('runKitOnce', () => {
  it(
    'does nothing when nothing is queued',
    withDb(async (db) => {
      const cv = vi.fn()
      const companion = vi.fn()
      const notify = vi.fn()
      expect(await runKitOnce(db, { cv, companion, notify, now: NOW })).toBe('idle')
      expect(cv).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    }),
  )

  it(
    'writes the CV, then the cover letter, and sends one push when the kit is ready',
    withDb(async (db) => {
      const out = chaseFind(db, '4460829599', find())
      if (out.kind === 'repost') throw new Error('fixture')
      enqueueKit(db, out.applicationId, NOW())
      const order: string[] = []
      const cv = vi.fn(async () => {
        order.push('cv')
        return {} as never
      })
      const companion = vi.fn(async (_db: unknown, _id: string, kind: string) => {
        order.push(kind)
        return {} as never
      })
      const notify = vi.fn(async (..._args: unknown[]) => 'sent' as const)
      expect(await runKitOnce(db, { cv, companion, notify, now: NOW })).toBe('done')
      expect(order).toEqual(['cv', 'coverLetter'])
      expect(cv).toHaveBeenCalledWith(db, out.applicationId, { reasonLanguage: 'es' })
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify.mock.calls[0]?.[1]).toMatchObject({
        kind: 'kit-ready',
        url: `/application/${out.applicationId}?step=docs`,
      })
      expect(latestKitFor(db, out.applicationId)?.state).toBe('done')
    }),
  )

  it(
    'a failed letter fails the kit, keeps it for the night retry, and says so once',
    withDb(async (db) => {
      const out = chaseFind(db, '4460829599', find())
      if (out.kind === 'repost') throw new Error('fixture')
      enqueueKit(db, out.applicationId, NOW())
      const notify = vi.fn(async (..._args: unknown[]) => 'sent' as const)
      const result = await runKitOnce(db, {
        cv: vi.fn(async () => ({}) as never),
        companion: vi.fn(async () => {
          throw new AiError('network', 'down')
        }),
        notify,
        now: NOW,
      })
      expect(result).toBe('failed')
      expect(latestKitFor(db, out.applicationId)).toMatchObject({
        state: 'queued',
        errorCode: 'network',
        attempts: 1,
      })
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify.mock.calls[0]?.[1]).toMatchObject({ kind: 'kit-failed' })
    }),
  )

  it(
    'an application deleted while queued fails the kit without a push',
    withDb(async (db) => {
      enqueueKit(db, 'app_gone', NOW())
      const notify = vi.fn()
      const result = await runKitOnce(db, {
        cv: vi.fn(async () => {
          throw new Error('not-found')
        }),
        companion: vi.fn(),
        notify,
        now: NOW,
      })
      expect(result).toBe('failed')
      expect(latestKitFor(db, 'app_gone')).toMatchObject({
        state: 'failed',
        errorCode: 'not-found',
      })
      expect(notify).not.toHaveBeenCalled()
    }),
  )
})

describe('runKitOnce — night retry', () => {
  it(
    'skips a retry when both documents were written by hand meanwhile',
    withDb(async (db) => {
      const { claimNext, finishKit } = await import('@/lib/kit/queue')
      const { mergeDocuments } = await import('@/lib/db/queries/applications')
      const out = chaseFind(db, '4460829599', find())
      if (out.kind === 'repost') throw new Error('fixture')
      enqueueKit(db, out.applicationId, new Date('2026-10-15T16:00:00Z'))
      const job = must(claimNext(db, new Date('2026-10-15T16:00:01Z')), 'a claimed job')
      finishKit(db, job.id, { ok: false, code: 'network' }, new Date('2026-10-15T16:01:00Z'))
      mergeDocuments(db, out.applicationId, {
        cv: { by: 'hand' },
        coverLetter: { document: {}, report: {} },
      } as never)
      const cv = vi.fn()
      const notify = vi.fn()
      const result = await runKitOnce(db, {
        cv,
        companion: vi.fn(),
        notify,
        now: () => new Date('2026-10-17T09:30:00Z'),
      })
      expect(result).toBe('done')
      expect(cv).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    }),
  )
})

describe('runKitOnce — a document already there is never bought again', () => {
  it(
    'a retry after a hand-made CV writes only the letter',
    withDb(async (db) => {
      const { claimNext, finishKit } = await import('@/lib/kit/queue')
      const { mergeDocuments, getApplication } = await import('@/lib/db/queries/applications')
      const out = chaseFind(db, '4460829599', find())
      if (out.kind === 'repost') throw new Error('fixture')
      enqueueKit(db, out.applicationId, new Date('2026-10-15T16:00:00Z'))
      const job = must(claimNext(db, new Date('2026-10-15T16:00:01Z')), 'a claimed job')
      finishKit(db, job.id, { ok: false, code: 'overloaded' }, new Date('2026-10-15T16:01:00Z'))
      mergeDocuments(db, out.applicationId, { cv: { by: 'hand' } } as never)
      const cv = vi.fn()
      const companion = vi.fn()
      const result = await runKitOnce(db, {
        cv,
        companion,
        notify: vi.fn(async () => 'sent' as const),
        now: () => new Date('2026-10-17T09:30:00Z'),
      })
      expect(result).toBe('done')
      expect(cv).not.toHaveBeenCalled()
      expect(companion).toHaveBeenCalledOnce()
      const docs = getApplication(db, out.applicationId)?.documents as { cv?: unknown }
      expect(docs.cv).toEqual({ by: 'hand' })
    }),
  )
})

describe('startKitRunner', () => {
  it(
    'runs one per process and puts interrupted kits back in the queue',
    withDb(async (db) => {
      const { startKitRunner } = await import('@/lib/kit/runner')
      const { claimNext } = await import('@/lib/kit/queue')
      const g = globalThis as unknown as {
        __cvforgeKitRunner?: { timer: ReturnType<typeof setInterval> }
      }
      enqueueKit(db, 'app_1', NOW())
      claimNext(db, NOW())
      try {
        startKitRunner(db)
        const first = g.__cvforgeKitRunner
        startKitRunner(db)
        expect(g.__cvforgeKitRunner).toBe(first)
        expect(latestKitFor(db, 'app_1')?.state).toBe('queued')
      } finally {
        if (g.__cvforgeKitRunner) clearInterval(g.__cvforgeKitRunner.timer)
        g.__cvforgeKitRunner = undefined
      }
    }),
  )
})
