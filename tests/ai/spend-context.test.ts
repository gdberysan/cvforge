import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import {
  currentSpendContext,
  type SpendContext,
  setSpendContextStore,
  singleSlotStore,
  withSpendContext,
} from '@/lib/ai/spend-context'
import { reportSpend, type SpendRecord, setSpendRecorder } from '@/lib/ai/spend-hook'
import {
  applicationSpend,
  attachRunToApplication,
  recordApiCall,
  typicalRunCost,
} from '@/lib/db/queries/spend'
import { apiCalls } from '@/lib/db/schema'
import { dbTest, seedApp } from '../support/db-app'

const tokens = { inputTokens: 10_000, outputTokens: 4_000, cacheReadTokens: 0, cacheWriteTokens: 0 }
const tick = () => new Promise((r) => setTimeout(r, 5))

function asyncLocal() {
  const storage = new AsyncLocalStorage<SpendContext>()
  return {
    run: <T>(c: SpendContext, fn: () => Promise<T>) => storage.run(c, fn),
    get: () => storage.getStore(),
  }
}

afterEach(() => {
  setSpendContextStore(null)
  setSpendRecorder(null)
})

describe('spend context', () => {
  it('follows each run across awaits on the server, even when two overlap', async () => {
    setSpendContextStore(asyncLocal())
    const seen: (string | undefined)[] = []
    const run = (id: string) =>
      withSpendContext({ action: 'cv', applicationId: id }, async () => {
        await tick()
        seen.push(currentSpendContext()?.applicationId)
      })
    await Promise.all([run('app_a'), run('app_b')])
    expect(seen.sort()).toEqual(['app_a', 'app_b'])
  })

  it('in the browser, attributes one run and refuses to guess while two overlap', async () => {
    setSpendContextStore(singleSlotStore())
    let alone: string | undefined
    await withSpendContext({ action: 'cv', applicationId: 'app_a' }, async () => {
      alone = currentSpendContext()?.applicationId
    })
    expect(alone).toBe('app_a')
    const during: (string | undefined)[] = []
    const run = (id: string) =>
      withSpendContext({ action: 'cv', applicationId: id }, async () => {
        await tick()
        during.push(currentSpendContext()?.applicationId)
      })
    await Promise.all([run('app_a'), run('app_b')])
    // While both run, a call is nobody's; once one has ended, the one still
    // running is the only one a call can come from.
    expect(during[0]).toBeUndefined()
    expect(['app_a', 'app_b']).toContain(during[1])
  })

  it('stamps each reported call with its run, and runs without a store record as before', async () => {
    const records: SpendRecord[] = []
    setSpendRecorder((r) => records.push(r))
    reportSpend({ stage: 'compose-cv', model: 'claude-opus-5', ...tokens })
    setSpendContextStore(asyncLocal())
    await withSpendContext({ action: 'analysis' }, async () => {
      reportSpend({ stage: 'extract-requirements', model: 'claude-sonnet-5-5', ...tokens })
    })
    expect(records[0]?.action).toBeUndefined()
    expect(records[1]).toMatchObject({ action: 'analysis', runId: expect.stringMatching(/^run_/) })
  })
})

describe('spend per action and per application', () => {
  it(
    'takes the median run, counts a run as all its calls, and skips runs with an unknown cost',
    dbTest((db) => {
      expect(typicalRunCost(db, 'cv')).toBeNull()
      // Opus: 10k in + 4k out = $0.15 a call; runs of 1, 2 and 3 calls.
      for (const [run, calls] of [
        ['run_1', 1],
        ['run_2', 2],
        ['run_3', 3],
      ] as const) {
        for (let i = 0; i < calls; i++) {
          recordApiCall(db, {
            stage: 'compose-cv',
            model: 'claude-opus-5',
            action: 'cv',
            runId: run,
            ...tokens,
          })
        }
      }
      expect(typicalRunCost(db, 'cv')).toBeCloseTo(0.3, 6)
      // A huge run with one call of unknown cost does not count at all.
      for (let i = 0; i < 9; i++) {
        recordApiCall(db, {
          stage: 'compose-cv',
          model: 'claude-opus-5',
          action: 'cv',
          runId: 'run_4',
          ...tokens,
        })
      }
      db.insert(apiCalls)
        .values({
          id: 'call_lost',
          stage: 'compose-cv',
          model: 'claude-opus-5',
          action: 'cv',
          runId: 'run_4',
          costKnown: false,
        })
        .run()
      expect(typicalRunCost(db, 'cv')).toBeCloseTo(0.3, 6)
      expect(typicalRunCost(db, 'analysis')).toBeNull()
    }),
  )

  it(
    'gives a new analysis its own calls, and nothing already attributed',
    dbTest((db) => {
      const app = seedApp(db)
      recordApiCall(db, {
        stage: 'extract-requirements',
        model: 'claude-opus-5',
        action: 'analysis',
        runId: 'run_x',
        ...tokens,
      })
      recordApiCall(db, {
        stage: 'compose-cv',
        model: 'claude-opus-5',
        action: 'cv',
        runId: 'run_y',
        applicationId: 'app_other',
        ...tokens,
      })
      attachRunToApplication(db, 'run_x', app)
      expect(applicationSpend(db, app).usd).toBeCloseTo(0.15, 6)
      expect(applicationSpend(db, 'app_other').usd).toBeCloseTo(0.15, 6)
      attachRunToApplication(db, undefined, app)
      expect(applicationSpend(db, app).usd).toBeCloseTo(0.15, 6)
    }),
  )
})
